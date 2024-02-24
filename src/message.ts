import { Dict, h, MessageEncoder, Context } from 'koishi'
import { RedBot } from './bot'
import { MessageSendPayload } from './types'
import { convertToPcm, getVideoCover, calculatePngSize } from './media'
import { basename, dirname, extname } from 'node:path'
import { decodeMessage, getPeer, toUTF8String } from './utils'
import { rename, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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

        const res = await this.bot.internal.sendMessage(this.payload)

        this.bot.redSeq.set(`${res.chatType}/${res.peerUin}/${res.msgSeq}`, res.msgId)

        const session = this.bot.session()
        await decodeMessage(this.bot, res, session.event.message = {}, session.event)
        this.results.push(session.event.message)
        session.app.emit(session, 'send', session)

        this.payload.elements = []
    }

    private text(content: string) {
        this.payload.elements.push({
            elementType: 1,
            textElement: {
                atType: 0,
                content,
            }
        })
    }

    private at(attrs: Dict) {
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
    }

    private async image(attrs: Dict) {
        const url = attrs.src || attrs.url.toString()
        const { data, mime, filename } = await this.bot.ctx.http.file(url, attrs)
        if (mime?.includes('text')) {
            this.bot.logger.warn(`try to send an image using a URL that may not be pointing to the image, which is ${url}`)
        }
        const payload = new FormData()
        const blob = new Blob([data], { type: mime || 'application/octet-stream' })
        payload.append('file', blob, 'file' + extname(filename))
        const res = await this.bot.internal.uploadFile(payload)

        const picType = {
            gif: 2000,
            png: 1001,
            webp: 1002
        }[res.imageInfo.type] ?? 1000

        this.payload.elements.push({
            elementType: 2,
            picElement: {
                md5HexStr: res.md5,
                fileSize: String(res.fileSize),
                fileName: basename(res.ntFilePath),
                sourcePath: res.ntFilePath,
                picHeight: res.imageInfo.height,
                picWidth: res.imageInfo.width,
                picType,
            }
        })
    }

    private async file(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.src || attrs.url, attrs)
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
                thumbFileSize: 750,
            },
        })
    }

    private face(attrs: Dict) {
        const [faceIndex, faceType, stickerType, packId, stickerId] = attrs.id.split(':')
        this.payload.elements.push({ elementType: 6, faceElement: { faceIndex, faceType, stickerType, packId, stickerId } })
    }

    private async audio(attrs: Dict) {
        const { data } = await this.bot.ctx.http.file(attrs.src || attrs.url, attrs)
        let voice: ArrayBuffer | Uint8Array = data
        let duration: number

        const { ctx } = this.bot
        if (!ctx.silk) {
            throw new Error('发送语音需确保已安装并启用 silk 插件')
        }
        if (ctx.silk.isWav(voice)) {
            const silk = await ctx.silk.encode(voice, 0)
            voice = silk.data
            duration = Math.round(silk.duration / 1000)
        } else if (!toUTF8String(voice, 0, 7).includes('#!SILK')) {
            let data: Buffer
            const input = Buffer.from(voice)
            if (ctx.ffmpeg) {
                data = await ctx.ffmpeg.builder().input(input).outputOption('-ar', '24000', '-ac', '1', '-f', 's16le').run('buffer')
            } else {
                data = await convertToPcm(input)
            }
            const silk = await ctx.silk.encode(data, 24000)
            voice = silk.data
            duration = Math.round(silk.duration / 1000)
        }
        duration ||= Math.round((await ctx.silk.getDuration(voice)) / 1000)

        const payload = new FormData()
        const blob = new Blob([voice], { type: 'audio/amr' })
        payload.append('file', blob, 'file.amr')
        const file = await this.bot.internal.uploadFile(payload)

        this.payload.elements.push({
            elementType: 4,
            pttElement: {
                md5HexStr: file.md5,
                fileSize: String(file.fileSize),
                fileName: basename(file.ntFilePath),
                filePath: file.ntFilePath,
                waveAmplitudes: [
                    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
                ],
                duration,
                formatType: 1,
            }
        })
    }

    private quote(attrs: Dict) {
        const senderUin = this.bot.selfId
        this.payload.elements.push({
            elementType: 7,
            replyElement: {
                replayMsgId: attrs.id,
                senderUin,
                senderUinStr: senderUin
            }
        })
    }

    private async video(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.src || attrs.url, attrs)

        const payload = new FormData()
        const blob = new Blob([data], { type: mime || 'application/octet-stream' })
        payload.append('file', blob, 'file' + extname(filename))
        const file = await this.bot.internal.uploadFile(payload)

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
        const { ctx, logger } = this.bot
        const input = Buffer.from(data)
        // Original is JFIF
        let thumb: Buffer
        if (ctx.ffmpeg) {
            thumb = await ctx.ffmpeg.builder().input(input).outputOption('-frames:v', '1', '-f', 'image2', '-codec', 'png', '-update', '1').run('buffer')
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
                thumbHeight,
            },
        })
    }

    async visit(element: h) {
        const { type, attrs, children } = element
        switch (type) {
            case 'text': {
                this.text(attrs.content)
                break
            }
            case 'message': {
                await this.flush()
                await this.render(children)
                await this.flush()
                break
            }
            case 'at': {
                this.at(attrs)
                break
            }
            case 'img':
            case 'image': {
                await this.image(attrs)
                break
            }
            case 'face': {
                this.face(attrs)
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
                    this.text('\n')
                }
                await this.render(children)
                const last = this.payload.elements.at(-1)
                if (last?.elementType === 1 && last.textElement.atType === 0) {
                    if (!last.textElement.content.endsWith('\n')) {
                        last.textElement.content += '\n'
                    }
                } else {
                    this.text('\n')
                }
                break
            }
            case 'br': {
                const prev = this.payload.elements.at(-1)
                if (prev?.elementType === 1 && prev.textElement.atType === 0) {
                    prev.textElement.content += '\n'
                } else {
                    this.text('\n')
                }
                break
            }
            case 'audio': {
                await this.audio(attrs)
                await this.flush()
                break
            }
            case 'quote': {
                this.quote(attrs)
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
                    prev.textElement.content += ` (${attrs.href})`
                }
                break
            }
            default: {
                await this.render(children)
                break
            }
        }
    }
}