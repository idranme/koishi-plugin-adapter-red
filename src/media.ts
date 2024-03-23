import { readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { unlink } from 'fs'
import { tmpdir } from 'os'
import { writeFile } from 'fs'
import { toUTF8String } from './utils'

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

export function convertToPcm(buffer: Buffer, samplingRate = '24000'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmpPath = saveTmp(buffer)
        const pcmPath = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${pcmPath}"`, async () => {
            unlink(tmpPath, NOOP)
            try {
                const pcm = await readFile(pcmPath)
                resolve(pcm)
            } catch {
                reject('音频转码失败, 请确保 ffmpeg 已正确安装, 否则仅能发送受支持的 wav 和 silk 格式的语音')
            } finally {
                unlink(pcmPath, NOOP)
            }
        })
    })
}

export function getVideoCover(input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmpPath = saveTmp(input)
        const targetPath = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -frames:v 1 -f image2 -codec png -update 1 "${targetPath}"`, async () => {
            unlink(tmpPath, NOOP)
            try {
                const ret = await readFile(targetPath)
                resolve(ret)
            } catch {
                reject('视频转码失败, 请确保 FFmpeg 已正确安装')
            } finally {
                unlink(targetPath, NOOP)
            }
        })
    })
}

export function calculatePngSize(input: Buffer) {
    // Detect "fried" png's: http://www.jongware.com/pngdefry.html
    if (toUTF8String(input, 12, 16) === 'CgBI') {
        return {
            height: input.readUInt32BE(36),
            width: input.readUInt32BE(32)
        }
    }
    return {
        height: input.readUInt32BE(20),
        width: input.readUInt32BE(16)
    }
}