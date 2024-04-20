import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exec } from 'node:child_process'
import { tmpdir } from 'node:os'
import { writeFile, unlink } from 'node:fs'
import { toUTF8String } from './utils'
import { noop } from 'koishi'

const TMP_DIR = tmpdir()

function saveTmp(data: Buffer, ext?: string): string {
    ext = ext ? '.' + ext : ''
    const filename = `adapter-red-${Date.now()}${ext}`
    const tmpPath = join(TMP_DIR, filename)
    writeFile(tmpPath, data, (err) => {
        if (err) throw err
    })
    return tmpPath
}

export function convertToPcm(buffer: Buffer, samplingRate = '24000'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmpPath = saveTmp(buffer)
        const targetPath = join(TMP_DIR, `adapter-red-${Date.now()}`)
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${targetPath}"`, async () => {
            unlink(tmpPath, noop)
            try {
                const ret = await readFile(targetPath)
                resolve(ret)
            } catch {
                reject('音频转码失败, 请确保 ffmpeg 已正确安装, 否则仅能发送受支持的 wav 和 silk 格式的语音')
            } finally {
                unlink(targetPath, noop)
            }
        })
    })
}

export function getVideoCover(input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmpPath = saveTmp(input)
        const targetPath = join(TMP_DIR, `adapter-red-${Date.now()}`)
        exec(`ffmpeg -y -i "${tmpPath}" -frames:v 1 -f image2 -codec png -update 1 "${targetPath}"`, async () => {
            unlink(tmpPath, noop)
            try {
                const ret = await readFile(targetPath)
                resolve(ret)
            } catch {
                reject('视频转码失败, 请确保 FFmpeg 已正确安装')
            } finally {
                unlink(targetPath, noop)
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