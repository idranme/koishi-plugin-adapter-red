import { writeFile, readFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { tmpdir } from 'os'
import { unlink } from 'fs'

const TMP_DIR = tmpdir()
export const NOOP = () => { }

export function audioTransPcm(tmpPath: string, samplingRate = '24000'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pcmPath: string = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${pcmPath}"`, async () => {
            unlink(tmpPath, NOOP)
            try{
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