import { Dict, h, MessageEncoder, Context } from 'koishi'
import { RedBot } from './bot'
import { MessageSendPayload } from './types'
import { convertToPcm, getVideoCover, calculatePngSize } from './media'
import { basename, dirname, extname, join } from 'node:path'
import { decodeMessage, getPeer } from './utils'
import { rename, mkdir, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { } from 'koishi-plugin-ffmpeg'
import { } from 'koishi-plugin-silk'

export class RedMessageEncoder<C extends Context = Context> extends MessageEncoder<C, RedBot<C>> {
    private payload: MessageSendPayload
    private trim = false

    async prepare() {
        this.payload = { peer: getPeer(this.channelId), elements: [] }
    }

    async flush() {
        if (this.payload.elements.length === 0) return

        if (this.trim) {
            const first = this.payload.elements[0]
            if (first?.elementType === 1 && first?.textElement.atType === 0) {
                if (first.textElement.content === '\n') {
                    this.payload.elements.splice(0, 1)
                }
            }
            const last = this.payload.elements.at(-1)
            if (last?.elementType === 1 && last?.textElement.atType === 0) {
                if (last.textElement.content === '\n') {
                    this.payload.elements.splice(this.payload.elements.length - 1, 1)
                } else if (last.textElement.content.endsWith('\n')) {
                    last.textElement.content = last.textElement.content.slice(0, -1)
                }
            }
            this.trim = false
        }

        const data = await this.bot.internal.sendMessage(this.payload)

        this.bot.redSeq.set(`${data.chatType}/${data.peerUin}/${data.msgSeq}`, [data.msgId, data.elements[0]?.elementId])

        const session = this.bot.session()
        await decodeMessage(this.bot, data, session.event.message = {}, session.event)
        this.results.push(session.event.message)
        session.app.emit(session, 'send', session)

        this.payload.elements = []
    }

    private async fetchFile(url: string, options: Dict = {}) {
        return await this.bot.ctx.http.file(url, options)
    }

    private async text(content: string) {
        this.payload.elements.push({
            elementType: 1,
            textElement: {
                atType: 0,
                content,
            }
        })
    }

    private async image(attrs: Dict) {
        const url = attrs.src || attrs.url.toString()
        const { data, mime, filename } = await this.fetchFile(url, attrs)
        if (mime?.includes('text')) {
            this.bot.logger.warn(`try to send an image using a URL that may not be pointing to the image, which is ${url}`)
        }
        const form = new FormData()
        const blob = new Blob([data], { type: mime || 'application/octet-stream' })
        form.append('file', blob, 'file' + extname(filename))
        const file = await this.bot.internal.uploadFile(form)

        const picType = {
            gif: 2000,
            png: 1001,
            webp: 1002
        }[file.imageInfo.type] ?? 1000

        this.payload.elements.push({
            elementType: 2,
            picElement: {
                md5HexStr: file.md5,
                fileSize: String(file.fileSize),
                fileName: basename(file.ntFilePath),
                sourcePath: file.ntFilePath,
                picHeight: file.imageInfo.height,
                picWidth: file.imageInfo.width,
                picType
            }
        })
    }

    private async file(attrs: Dict) {
        const { data, filename, mime } = await this.fetchFile(attrs.src || attrs.url, attrs)
        const form = new FormData()
        const blob = new Blob([data], { type: mime || 'application/octet-stream' })
        form.append('file', blob, filename)
        const res = await this.bot.internal.uploadFile(form)

        this.payload.elements.push({
            elementType: 3,
            fileElement: {
                fileName: filename,
                filePath: res.filePath,
                fileSize: String(res.fileSize),
                thumbFileSize: 750
            }
        })
    }

    private async audio(attrs: Dict) {
        const { data } = await this.fetchFile(attrs.src || attrs.url, attrs)
        let voice: ArrayBuffer | Uint8Array = data
        let duration: number

        const { ctx } = this.bot
        if (!ctx.silk) {
            throw new Error('发送语音需确保已安装并启用 silk 插件')
        }

        const convert = async (voice: ArrayBuffer, sampleRate: number) => {
            let data: Buffer
            const input = Buffer.from(voice)
            if (ctx.ffmpeg) {
                data = await ctx.ffmpeg.builder().input(input).outputOption('-ar', String(sampleRate), '-ac', '1', '-f', 's16le').run('buffer')
            } else {
                data = await convertToPcm(input, String(sampleRate))
            }
            return data
        }

        if (!ctx.silk.isSilk) throw new Error('请更新 silk 插件至最新版本')
        if (ctx.silk.isWav(voice)) {
            const allowSampleRate = [8000, 12000, 16000, 24000, 32000, 44100, 48000]
            const { fmt } = ctx.silk.getWavFileInfo(voice)
            if (!allowSampleRate.includes(fmt.sampleRate)) {
                const pcm = await convert(voice, 24000)
                const silk = await ctx.silk.encode(pcm, 24000)
                voice = silk.data
                duration = Math.round(silk.duration / 1000)
            } else {
                const silk = await ctx.silk.encode(voice, 0)
                voice = silk.data
                duration = Math.round(silk.duration / 1000)
            }
        } else if (!ctx.silk.isSilk(voice)) {
            const pcm = await convert(voice, 24000)
            const silk = await ctx.silk.encode(pcm, 24000)
            voice = silk.data
            duration = Math.round(silk.duration / 1000)
        }
        duration ||= Math.round(ctx.silk.getDuration(voice) / 1000)

        const form = new FormData()
        const blob = new Blob([voice], { type: 'audio/amr' })
        form.append('file', blob, 'file.amr')
        const file = await this.bot.internal.uploadFile(form)

        this.payload.elements.push({
            elementType: 4,
            pttElement: {
                md5HexStr: file.md5,
                fileSize: String(file.fileSize),
                fileName: basename(file.ntFilePath),
                filePath: file.ntFilePath,
                waveAmplitudes: [
                    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99
                ],
                duration,
                formatType: 1
            }
        })
    }

    private async video(attrs: Dict) {
        const { data, filename, mime } = await this.fetchFile(attrs.src || attrs.url, attrs)

        const form = new FormData()
        const blob = new Blob([data], { type: mime || 'application/octet-stream' })
        form.append('file', blob, 'file' + extname(filename))
        const file = await this.bot.internal.uploadFile(form)

        let filePath = file.ntFilePath.replaceAll('\\', '/')
        const fileName = basename(filePath)
        if (!existsSync(filePath)) {
            throw new Error('发送视频需确保 Red 与 Koishi 处于同一环境')
        }
        if (!filePath.includes('/nt_data/Video/')) {
            const newPath = filePath.replace(/\/nt_data\/(.*?)\//, '/nt_data/Video/')
            const targetFolder = dirname(newPath)
            if (!existsSync(targetFolder)) {
                await mkdir(targetFolder)
            }
            await rename(filePath, newPath)
            filePath = newPath
        }
        let thumbPath = filePath.replace('/Ori/' + fileName, '/Thumb/' + fileName)
        thumbPath = thumbPath.replace(fileName, fileName.replace(extname(fileName), '') + '_0.png')
        const { ctx } = this.bot
        const input = Buffer.from(data)
        // Original is JFIF
        let thumb: Buffer
        if (ctx.ffmpeg) {
            const path = join(tmpdir(), `adapter-red-${Date.now()}`)
            await writeFile(path, input)
            thumb = await ctx.ffmpeg.builder().input(path).outputOption('-frames:v', '1', '-f', 'image2', '-codec', 'png', '-update', '1').run('buffer')
            unlink(path)
        } else {
            thumb = await getVideoCover(input)
        }
        await writeFile(thumbPath, thumb)
        const { height: thumbHeight, width: thumbWidth } = calculatePngSize(thumb)

        this.payload.elements.push({
            elementType: 5,
            videoElement: {
                filePath,
                fileName,
                videoMd5: file.md5,
                fileSize: String(file.fileSize),
                thumbSize: thumb.byteLength,
                thumbWidth,
                thumbHeight
            }
        })
    }

    async visit(element: h) {
        const { type, attrs, children } = element
        switch (type) {
            case 'text': {
                await this.text(attrs.content)
                break
            }
            case 'message': {
                await this.flush()
                await this.render(children)
                await this.flush()
                break
            }
            case 'at': {
                if (attrs.type === 'all') {
                    this.payload.elements.push({
                        elementType: 1,
                        textElement: {
                            content: '@全体成员',
                            atType: 1,
                        }
                    })
                } else {
                    this.payload.elements.push({
                        elementType: 1,
                        textElement: {
                            content: attrs.name ? '@' + attrs.name : undefined,
                            atType: 2,
                            atNtUin: attrs.id
                        },
                    })
                }
                break
            }
            case 'img':
            case 'image': {
                await this.image(attrs)
                break
            }
            case 'face': {
                const [faceIndex, faceType, stickerType, packId, stickerId] = attrs.id.split(':')
                this.payload.elements.push({
                    elementType: 6,
                    faceElement: {
                        faceIndex,
                        faceType,
                        stickerType,
                        packId,
                        stickerId
                    }
                })
                break
            }
            case 'figure': {
                await this.render(children)
                await this.flush()
                break
            }
            case 'p': {
                this.trim = true
                const prev = this.payload.elements.at(-1)
                if (prev?.elementType === 1 && prev.textElement.atType === 0) {
                    if (!prev.textElement.content.endsWith('\n')) {
                        prev.textElement.content += '\n'
                    }
                } else {
                    await this.text('\n')
                }
                await this.render(children)
                const last = this.payload.elements.at(-1)
                if (last?.elementType === 1 && last.textElement.atType === 0) {
                    if (!last.textElement.content.endsWith('\n')) {
                        last.textElement.content += '\n'
                    }
                } else {
                    await this.text('\n')
                }
                break
            }
            case 'br': {
                const prev = this.payload.elements.at(-1)
                if (prev?.elementType === 1 && prev.textElement.atType === 0) {
                    prev.textElement.content += '\n'
                } else {
                    await this.text('\n')
                }
                break
            }
            case 'audio': {
                await this.audio(attrs)
                await this.flush()
                break
            }
            case 'quote': {
                const senderUin = this.bot.selfId
                this.payload.elements.push({
                    elementType: 7,
                    replyElement: {
                        replayMsgId: attrs.id,
                        senderUin,
                        senderUinStr: senderUin
                    }
                })
                break
            }
            case 'file': {
                await this.file(attrs)
                await this.flush()
                break
            }
            case 'video': {
                await this.video(attrs)
                await this.flush()
                break
            }
            case 'a': {
                await this.render(children)
                const prev = this.payload.elements.at(-1)
                if (prev?.elementType === 1 && prev.textElement.atType === 0) {
                    prev.textElement.content += ` ( ${attrs.href} )`
                }
                break
            }
            case 'red:mface': {
                const { id, name, key, packageId } = attrs
                this.payload.elements.push({
                    elementType: 11,
                    marketFaceElement: {
                        emojiPackageId: Number(packageId),
                        faceName: `[${name ?? '商城表情'}]`,
                        emojiId: id,
                        key
                    }
                })
                break
            }
            default: {
                await this.render(children)
                break
            }
        }
    }
}