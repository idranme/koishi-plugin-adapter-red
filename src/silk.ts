import { encode, decode, getDuration, encodeResult, decodeResult } from 'silk-wasm'
import { isMainThread, parentPort, Worker, MessageChannel } from 'node:worker_threads'
import { Dict, sleep } from 'koishi'
import { availableParallelism } from 'node:os'
import { Semaphore } from '@shopify/semaphore'

interface WorkerInstance {
    worker: Worker
    busy: boolean
}

if (!isMainThread && parentPort) {
    parentPort.addListener('message', (e) => {
        const data: Dict = e.data
        const port: MessagePort = e.port
        switch (data?.type) {
            case "encode":
                encode(data.input, data.sampleRate)
                    .then(ret => {
                        port.postMessage(ret)
                    }).catch(err => {
                        port.postMessage(err)
                    }).finally(() => {
                        port.close()
                    })
                break
            case "decode":
                decode(data.input, data.sampleRate).then(ret => {
                    port.postMessage(ret)
                }).catch(err => {
                    port.postMessage(err)
                }).finally(() => {
                    port.close()
                })
                break
            case "getDuration":
                let ret: number
                try {
                    ret = getDuration(data.silk, data.frameMs)
                } catch (err) {
                    ret = err
                }
                port.postMessage(ret)
                port.close()
                break
            default:
                port.postMessage(undefined)
                port.close()
        }
    })
}

const workers: WorkerInstance[] = []
let maxThreads = 1
let lastTime = 0, used = 0

function postMessage<T extends any>(data: Dict): Promise<T> {
    let indexing = 0
    if (workers.length === 0) {
        workers.push({
            worker: new Worker(__filename),
            busy: false
        })
        used++
    } else {
        let found = false
        for (const [index, value] of workers.entries()) {
            if (value?.busy === false) {
                indexing = index
                found = true
                break
            }
        }
        if (!found) {
            const len = workers.push({
                worker: new Worker(__filename),
                busy: false
            })
            used++
            indexing = len - 1
        }
    }
    workers[indexing].busy = true
    const subChannel = new MessageChannel()
    const port = subChannel.port2
    return new Promise((resolve, reject) => {
        port.once('message', async (ret) => {
            port.close()
            const isError = ret instanceof Error
            if (!isError && data.type === 'encode') {
                const interval = Date.now() - lastTime
                const sizeInMB = ret.data.length / 1_048_576
                const minInterval = sizeInMB * 1300
                if (interval < minInterval) {
                    await sleep(minInterval - interval)
                }
            }
            if (used > maxThreads - 1) {
                workers[indexing].worker.terminate()
                workers[indexing] = undefined
                used--
            } else {
                workers[indexing].busy = false
            }
            isError ? reject(ret) : resolve(ret)
        })
        workers[indexing].worker.postMessage({ port: subChannel.port1, data: data }, [subChannel.port1])
    })
}

let semaphore: Semaphore

function init(){
    if(!semaphore){
        maxThreads = Math.min(availableParallelism(), 2)
        semaphore = new Semaphore(maxThreads)
    }
}

export async function silkEncode(input: Uint8Array, sampleRate: number) {
    init()
    const permit = await semaphore.acquire()
    return postMessage<encodeResult>({ type: 'encode', input, sampleRate }).finally(() => {
        lastTime = Date.now()
        permit.release()
    })
}

export async function silkDecode(input: Uint8Array, sampleRate: number) {
    init()
    const permit = await semaphore.acquire()
    return postMessage<decodeResult>({ type: 'decode', input, sampleRate }).finally(() => permit.release())
}

export async function silkGetDuration(silk: Uint8Array, frameMs = 20) {
    init()
    const permit = await semaphore.acquire()
    return postMessage<number>({ type: 'getDuration', silk, frameMs }).finally(() => permit.release())
}