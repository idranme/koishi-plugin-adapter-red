import { readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { unlink } from 'fs'
import { tmpdir } from 'os'
import { writeFile } from 'fs'
import { decodeWavFile } from 'wav-file-decoder-cjs'

const TMP_DIR = tmpdir()
const NOOP = () => { }

function saveTmp(data: Buffer, ext?: string): string {
    ext = ext ? '.' + ext : ''
    const filename = randomUUID({ disableEntropyCache: true }) + ext
    const tmpPath = resolve(TMP_DIR, filename)
    writeFile(tmpPath, data, (err) => {
        if (err) throw err
    })
    return tmpPath
}

export function audioTransPcm(buffer: Buffer, samplingRate = '24000'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmpPath = saveTmp(buffer)
        const pcmPath = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${pcmPath}"`, async () => {
            unlink(tmpPath, NOOP)
            try {
                const pcm = await readFile(pcmPath)
                resolve(pcm)
            } catch {
                reject('音频转码失败, 请确保 ffmpeg 已正确安装, 当前仅支持发送 wav 和 silk 格式的语音')
            } finally {
                unlink(pcmPath, NOOP)
            }
        })
    })
}

export function wavToPcm(input: Uint8Array) {
    const { channelData, sampleRate, numberOfChannels } = decodeWavFile(input)
    const monoData = convertPcmToMono(channelData, numberOfChannels)
    const s16lePcm = f32leToS16lePcm(monoData)
    return {
        data: new Uint8Array(s16lePcm),
        sampleRate
    }
}

function convertPcmToMono(channelData: Float32Array[], numberOfChannels: number): Float32Array {
    // 如果numberOfChannels为1，直接返回channelData[0]作为单声道数据
    if (numberOfChannels === 1) {
        return channelData[0]
    }
    // 否则，创建一个新的Float32Array，长度为channelData[0]的长度
    let monoData = new Float32Array(channelData[0].length)
    // 遍历每个采样点
    for (let i = 0; i < monoData.length; i++) {
        // 初始化一个变量，用于累加多声道数据的值
        let sum = 0
        // 遍历每个声道
        for (let j = 0; j < numberOfChannels; j++) {
            // 将该声道在该采样点的值加到sum上
            sum += channelData[j][i]
        }
        // 将sum除以numberOfChannels，得到平均值，作为单声道数据在该采样点的值
        monoData[i] = sum / numberOfChannels
    }
    // 返回单声道数据
    return monoData
}

function f32leToS16lePcm(input: Float32Array): ArrayBuffer {
    const numberOfFrames = input.length
    const bytesPerSample = Math.ceil(16 / 8)
    const fileLength = numberOfFrames * bytesPerSample
    const arrayBuffer = new ArrayBuffer(fileLength)
    const int16Array = new Int16Array(arrayBuffer)
    for (let offset = 0; offset < numberOfFrames; offset++) {
        const sampleValueFloat = input[offset]
        const sampleValueInt16 = floatToSignedInt16(sampleValueFloat)
        int16Array[offset] = sampleValueInt16
    }
    return arrayBuffer
}

// input: [-1,1] float32
function floatToSignedInt16(v: number): number {
    v *= 32768
    v = ~~v
    return v > 32767 ? 32767 : v
}

/*
console.log(floatToSignedInt16(0.5)); // 输出16384
console.log(floatToSignedInt16(-0.5)); // 输出-16384
console.log(floatToSignedInt16(0.123456789)); // 输出4056
console.log(floatToSignedInt16(-0.987654321)); // 输出-32440
console.log(floatToSignedInt16(1)); // 输出32767
console.log(floatToSignedInt16(-1)); // 输出-32768
*/