import { writeFile, readFile, stat } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { tmpdir } from 'os'
import { unlink, access, constants } from 'fs'
import { encode } from 'node-silk-encode'

const TMP_DIR = tmpdir()
const NOOP = () => { }

export async function uploadAudio(buffer: Buffer) {
    const head = buffer.subarray(0, 7).toString()

    let filePath: string
    let duration = 0
    let fileSize = buffer.length
    if (!head.includes('SILK')) {
        const tmpPath = resolve(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        await writeFile(tmpPath, buffer)
        duration = await getDuration(tmpPath)
        const res = await audioTrans(tmpPath)
        filePath = res.silkFile
        const fileInfo = await stat(filePath)
        fileSize = fileInfo.size
    } else {
        filePath = resolve(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        await writeFile(filePath, buffer)
    }

    const hash = createHash('md5')
    hash.update(buffer.toString('binary'), 'binary')
    const md5 = hash.digest('hex')

    return {
        md5,
        fileSize,
        filePath,
        duration
    }
}

interface transRet {
    silkFile: string
}

function audioTrans(tmpPath: string): Promise<transRet> {
    return new Promise((resolve, reject) => {
        const pcmFile: string = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
        exec(`ffmpeg -y -i "${tmpPath}" -ar 44100 -ac 1 -f s16le "${pcmFile}"`, async () => {
            unlink(tmpPath, NOOP)
            access(pcmFile, constants.F_OK, (err) => {
                if (err) {
                    reject('音频转码失败, 请确认你的 ffmpeg 可用')
                }
            })

            const silkFile = join(TMP_DIR, randomUUID({ disableEntropyCache: true }))
            await encode(pcmFile, silkFile)
            unlink(pcmFile, NOOP)
            access(silkFile, constants.F_OK, (err) => {
                if (err) {
                    reject('音频转码失败')
                }
            })

            resolve({
                silkFile
            })
        })
    })
}

function getDuration(file: string): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i ${file}`, function (err, stdout, stderr) {
            const outStr = stderr.toString()
            const regDuration = /Duration\: ([0-9\:\.]+),/
            const rs = regDuration.exec(outStr)
            if (rs === null) {
                reject("获取音频时长失败, 请确认你的 ffmpeg 可用")
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