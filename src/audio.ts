import { readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { unlink } from 'fs'
import { tmpdir } from 'os'
import { writeFile } from 'fs'

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
                reject('音频转码失败, 请确保 ffmpeg 已正确安装')
            } finally {
                unlink(pcmPath, NOOP)
            }
        })
    })
}