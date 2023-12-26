/**
 * Forked from https://github.com/xfdown/xiaofei-plugin/blob/master/model/silk_worker/index.cjs
 * Original license: https://github.com/xfdown/xiaofei-plugin/blob/master/LICENSE
 */
import { encode, decode, getDuration, encodeResult, decodeResult } from 'silk-wasm'
import { isMainThread, parentPort, Worker, MessageChannel } from 'node:worker_threads'
import { Dict } from 'koishi'

if (!isMainThread && parentPort) {
    parentPort.addListener('message', (val) => {
        const data: Dict = val.data
        const port: MessagePort = val.port
        switch (data?.type) {
            case "encode":
                encode(data.input, data.sampleRate).then(ret => {
                    port.postMessage(ret)
                    port.close()
                })
                break
            case "decode":
                decode(data.input, data.sampleRate).then(ret => {
                    port.postMessage(ret)
                    port.close()
                })
                break
            case "getDuration":
                const ret = getDuration(data.silk, data.frameMs)
                port.postMessage(ret)
                port.close()
                break
            default:
                port.postMessage(undefined)
                port.close()
        }
    })
}

let worker: Worker

function postMessage<T extends any>(data: Dict): Promise<T> {
    worker ||= new Worker(__filename)
    const subChannel = new MessageChannel()
    const port = subChannel.port2
    return new Promise(resolve => {
        port.once('message', (ret) => {
            port.close()
            resolve(ret)
        })
        worker.postMessage({ port: subChannel.port1, data: data }, [subChannel.port1])
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