import { writeFile, readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { tmpdir } from 'os'
import { unlink } from 'fs'
import { Context, sanitize, trimSlash } from 'koishi'
import { RedBot } from './bot'
import { Message } from './types'

const TMP_DIR = tmpdir()
export const NOOP = () => { }

export function audioTransPcm(tmpPath: string, samplingRate = '24000'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pcmPath: string = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${pcmPath}"`, async () => {
            unlink(tmpPath, NOOP)
            try {
                const pcm = await readFile(pcmPath)
                resolve(pcm)
            } catch {
                reject('音频转码失败, 请确保 ffmpeg 已正确安装')
            } finally {
                unlink(pcmPath, NOOP)
            }
        })
    })
}

export function getDuration(file: string): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i ${file}`, function (err, stdout, stderr) {
            const outStr = stderr.toString()
            const regDuration = /Duration\: ([0-9\:\.]+),/
            const rs = regDuration.exec(outStr)
            if (rs === null) {
                reject('获取音频时长失败, 请确保 ffmpeg 已正确安装')
            } else if (rs[1]) {
                //获得时长
                const time = rs[1]
                const parts = time.split(":")
                const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2])
                const round = seconds.toString().split('.')[0]
                resolve(+ round)
            }
        })
    })
}

export async function saveTmp(data: Buffer, ext?: string): Promise<string> {
    ext = ext ? '.' + ext : ''
    const filename = randomUUID({ disableEntropyCache: true }) + ext
    const tmpPath = resolve(TMP_DIR, filename)
    await writeFile(tmpPath, data)
    return tmpPath
}

export function pcm2Wav(pcm: Uint8Array, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16) {
    let header = {
        // OFFS SIZE NOTES
        chunkId: [0x52, 0x49, 0x46, 0x46], // 0    4    "RIFF" = 0x52494646
        chunkSize: 0, // 4    4    36+SubChunk2Size = 4+(8+SubChunk1Size)+(8+SubChunk2Size)
        format: [0x57, 0x41, 0x56, 0x45], // 8    4    "WAVE" = 0x57415645
        subChunk1Id: [0x66, 0x6d, 0x74, 0x20], // 12   4    "fmt " = 0x666d7420
        subChunk1Size: 16, // 16   4    16 for PCM
        audioFormat: 1, // 20   2    PCM = 1
        numChannels: numChannels, // 22   2    Mono = 1, Stereo = 2...
        sampleRate: sampleRate, // 24   4    8000, 44100...
        byteRate: 0, // 28   4    SampleRate*NumChannels*BitsPerSample/8
        blockAlign: 0, // 32   2    NumChannels*BitsPerSample/8
        bitsPerSample: bitsPerSample, // 34   2    8 bits = 8, 16 bits = 16
        subChunk2Id: [0x64, 0x61, 0x74, 0x61], // 36   4    "data" = 0x64617461
        subChunk2Size: 0, // 40   4    data size = NumSamples*NumChannels*BitsPerSample/8
    }
    function u32ToArray(i) {
        return [i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff]
    }
    function u16ToArray(i) {
        return [i & 0xff, (i >> 8) & 0xff]
    }
    header.blockAlign = (header.numChannels * header.bitsPerSample) >> 3
    header.byteRate = header.blockAlign * header.sampleRate
    header.subChunk2Size = pcm.length * (header.bitsPerSample >> 3)
    header.chunkSize = 36 + header.subChunk2Size

    let wavHeader = header.chunkId.concat(
        u32ToArray(header.chunkSize),
        header.format,
        header.subChunk1Id,
        u32ToArray(header.subChunk1Size),
        u16ToArray(header.audioFormat),
        u16ToArray(header.numChannels),
        u32ToArray(header.sampleRate),
        u32ToArray(header.byteRate),
        u16ToArray(header.blockAlign),
        u16ToArray(header.bitsPerSample),
        header.subChunk2Id,
        u32ToArray(header.subChunk2Size)
    )
    const wavHeaderUnit8 = new Uint8Array(wavHeader)

    const mergedArray = new Uint8Array(wavHeaderUnit8.length + pcm.length)
    mergedArray.set(wavHeaderUnit8)
    mergedArray.set(pcm, wavHeaderUnit8.length)

    return mergedArray
}

export class RedAssetsLocal<C extends Context = Context> {
    private path: string
    private selfUrl: string
    private running = false
    constructor(private bot: RedBot<C>, private config: RedBot.Config) {
    }
    set(message: Message, elementId: string, mime?: string) {
        const payload = Buffer.from(JSON.stringify({
            msgId: message.msgId,
            chatType: message.chatType,
            peerUid: message.peerUin,
            elementId
        })).toString('base64')
        return `${this.selfUrl}${this.path}/${payload}${mime ? '?mime=' + encodeURIComponent(mime) : ''}`
    }
    get(data: string) {
        const payload = JSON.parse(Buffer.from(data, 'base64').toString())
        return this.bot.http.axios('/message/fetchRichMedia', {
            method: 'POST',
            data: {
                msgId: payload.msgId,
                chatType: payload.chatType,
                peerUid: payload.peerUid,
                elementId: payload.elementId,
            },
            responseType: 'arraybuffer'
        })
    }
    start() {
        if (this.running) return false
        this.path = sanitize(this.config.path || '/files')
        if (this.config.selfUrl) {
            this.selfUrl = trimSlash(this.config.selfUrl)
        } else {
            if (!this.bot.ctx.router.port) return false
            // @ts-ignore
            this.selfUrl = this.bot.ctx.root.selfUrl || `http://127.0.0.1:${this.bot.ctx.router.port}`
        }
        this.bot.ctx.router.get(this.path, async (ctx) => {
            ctx.body = '200 OK'
            ctx.status = 200
        });
        this.bot.ctx.router.get(this.path + '/:data', async (ctx) => {
            const response = await this.get(ctx.params['data'])
            ctx.body = response.data
            ctx.type = ctx.query['mime'] || response.headers['content-type']
            ctx.header['date'] = response.headers['date']
            ctx.status = response.status
        })
        this.running = true
    }
}