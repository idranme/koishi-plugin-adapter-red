/**
 * Forked from https://github.com/xfdown/xiaofei-plugin/blob/master/model/silk_worker/index.cjs
 * Its license: https://github.com/xfdown/xiaofei-plugin/blob/master/LICENSE
 */
import { encode, decode, getDuration, encodeResult, decodeResult } from 'silk-wasm'
import { isMainThread, parentPort, Worker, MessageChannel } from 'node:worker_threads'
import { Dict } from 'koishi'
import { cpus } from 'node:os'

interface WorkerInstance {
    worker: Worker
    busy: boolean
}

if (!isMainThread && parentPort) {
    parentPort.addListener('message', (val) => {
        const data: Dict = val.data
        const port: MessagePort = val.port
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
const numCPUs = cpus().length
let availability = 0

function postMessage<T extends any>(data: Dict): Promise<T> {
    let indexing = 0
    if (workers.length === 0) {
        workers.push({
            worker: new Worker(__filename),
            busy: false
        })
        availability++
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
            availability++
            indexing = len - 1
        }
    }
    workers[indexing].busy = true
    const subChannel = new MessageChannel()
    const port = subChannel.port2
    return new Promise((resolve, reject) => {
        port.once('message', (ret) => {
            port.close()
            workers[indexing].busy = false
            if (availability > numCPUs - 1) {
                workers[indexing].worker.terminate()
                workers[indexing] = undefined
                availability--
            }
            ret instanceof Error ? reject(ret) : resolve(ret)
        })
        workers[indexing].worker.postMessage({ port: subChannel.port1, data: data }, [subChannel.port1])
    })
}

export function silkEncode(input: Uint8Array, sampleRate: number) {
    return postMessage<encodeResult>({ type: 'encode', input, sampleRate })
}

export function silkDecode(input: Uint8Array, sampleRate: number) {
    return postMessage<decodeResult>({ type: 'decode', input, sampleRate })
}

export function silkGetDuration(silk: Uint8Array, frameMs = 20) {
    return postMessage<number>({ type: 'getDuration', silk, frameMs })
}