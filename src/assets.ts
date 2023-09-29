import { writeFile, readFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { tmpdir } from 'os'
import { unlink, access, constants } from 'fs'
import { encode } from 'node-silk-encode'

const TMP_DIR = tmpdir()
export const NOOP = () => { }

export async function uploadAudio(buffer: Buffer) {
    const head = buffer.subarray(0, 7).toString()

    let filePath: string
    let duration = 0
    if (!head.includes('SILK')) {
        const tmpPath = await saveTmp(buffer)
        duration = await getDuration(tmpPath)
        const res = await audioTrans(tmpPath)
        filePath = res.silkFile
        buffer = await readFile(filePath)
    } else {
        filePath = await saveTmp(buffer)
    }

    const hash = createHash('md5')
    hash.update(buffer.toString('binary'), 'binary')
    const md5 = hash.digest('hex')

    return {
        md5,
        fileSize: buffer.length,
        filePath,
        duration
    }
}

interface transRet {
    silkFile: string
}

export function audioTrans(tmpPath: string, samplingRate = '24000'): Promise<transRet> {
    return new Promise((resolve, reject) => {
        const pcmFile: string = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar ${samplingRate} -ac 1 -f s16le "${pcmFile}"`, async () => {
            unlink(tmpPath, NOOP)
            access(pcmFile, constants.F_OK, (err) => {
                if (err) {
                    reject('音频转码失败, 请确保你的 ffmpeg 已正确安装')
                }
            })

            const silkFile = join(TMP_DIR, randomUUID({ disableEntropyCache: true }) + '.amr')
            await encode(pcmFile, silkFile, samplingRate)
            unlink(pcmFile, NOOP)

            resolve({
                silkFile
            })
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
                reject("获取音频时长失败, 请确保你的 ffmpeg 已正确安装")
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

export function imageTrans(file: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const uuid = randomUUID({ disableEntropyCache: true })
        const tmpfile = join(TMP_DIR, uuid + '.png')
        exec(`ffmpeg -i "${file}" "${tmpfile}"`, async (error, stdout, stderr) => {
            try {
                const png = await readFile(tmpfile)
                resolve(png)
            } catch {
                reject("图片转码到 png 失败, 请确保你的 ffmpeg 已正确安装")
            } finally {
                unlink(tmpfile, NOOP)
            }
        })
    })
}