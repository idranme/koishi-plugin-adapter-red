import { writeFile, readFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { exec } from 'child_process'
import { tmpdir } from 'os'
import { unlink } from 'fs'

const TMP_DIR = tmpdir()
const NOOP = () => { }

export async function uploadAudio(buffer: Buffer, mime: string) {
    if (mime !== 'audio/amr') {
        const uuid = randomUUID({ disableEntropyCache: true })
        const savePath = resolve(TMP_DIR, uuid)
        await writeFile(savePath, buffer)
        buffer = await audioTrans(savePath)
        unlink(savePath, NOOP)
    }

    const hash = createHash('md5')
    hash.update(buffer.toString('binary'), 'binary')
    const md5 = hash.digest('hex')

    const savePath = resolve(TMP_DIR, md5)
    await writeFile(savePath, buffer)

    const duration = await getDuration(savePath)

    return {
        md5,
        fileSize: buffer.length,
        filePath: savePath,
        duration
    }
}

function audioTrans(file: string, ffmpeg = "ffmpeg"): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const uuid = randomUUID({ disableEntropyCache: true })
        const tmpfile = join(TMP_DIR, uuid)
        exec(`${ffmpeg} -y -i "${file}" -ac 1 -ar 8000 -f amr "${tmpfile}"`, async (error, stdout, stderr) => {
            try {
                const amr = await readFile(tmpfile)
                resolve(amr)
            } catch {
                reject("音频转码到 amr 失败, 请确认你的 ffmpeg 可以处理此转换")
            } finally {
                unlink(tmpfile, NOOP)
            }
        })
    })
}

function getDuration(file: string, ffmpeg = "ffmpeg"): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(`${ffmpeg} -i ${file}`, function (err, stdout, stderr) {
            const outStr = stderr.toString()
            const regDuration = /Duration\: ([0-9\:\.]+),/
            const rs = regDuration.exec(outStr)
            if (rs[1]) {
                //获得时长
                const time = rs[1]
                const parts = time.split(":")
                const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2])
                const round = seconds.toString().split('.')[0]
                resolve(+ round)
            } else {
                reject("获取音频时长失败, 请确认你的 ffmpeg 可用")
            }
        })
    })
}