import { Dict, h, MessageEncoder, noop } from 'koishi'
import { RedBot } from './bot'
import { Element } from './types'
import FormData from 'form-data'
import * as face from 'qface'
import { uploadAudio, saveTmp, image2png, audioTrans, getDuration, NOOP } from './assets'
import { unlink } from 'fs'
import { basename } from 'path'
import { readFile } from 'fs/promises'

export class RedMessageEncoder extends MessageEncoder<RedBot> {
    elements: Element[] = []
    trim = false

    async flush(): Promise<void> {
        //console.log(this.elements)
        if (this.trim) {
            const first = this.elements[0]
            if (first?.elementType === 1 && first?.textElement.atType === 0) {
                if (first.textElement.content === '\n') {
                    this.elements.splice(0, 1)
                }
            }
            const latest = this.elements[this.elements.length - 1]
            if (latest?.elementType === 1 && latest?.textElement.atType === 0) {
                if (latest.textElement.content === '\n') {
                    this.elements.splice(this.elements.length - 1, 1)
                } else if (latest.textElement.content.endsWith('\n')) {
                    latest.textElement.content = latest.textElement.content.slice(0, -2)
                }
            }
        }
        let peerUin = this.session.channelId
        let chatType = 2
        if(this.session.channelId.includes('private:')){
            peerUin = this.session.channelId.split(':')[1]
            chatType = 1
        }
        this.bot.internal._wsRequest('message::send', {
            peer: {
                chatType,
                peerUin,
                guildId: null
            },
            elements: this.elements
        })
        const session = this.bot.session()
        session.messageId = ''
        session.timestamp = +new Date()
        session.userId = this.bot.selfId
        this.results.push(session)
        session.app.emit(session, 'send', session)

        this.elements = []
    }

    private text(content: string) {
        this.elements.push({
            elementType: 1,
            textElement: {
                atType: 0,
                content,
            }
        } as any)
    }

    private at(attrs: Dict) {
        if (attrs.type === 'all') {
            this.elements.push({
                elementType: 1,
                textElement: {
                    content: '@全体成员',
                    atType: 1,
                }
            } as any)
        } else {
            this.elements.push({
                elementType: 1,
                textElement: {
                    content: attrs.name ? '@' + attrs.name : undefined,
                    atType: 2,
                    atNtUin: attrs.id
                },
            } as any)
        }
    }

    private async uploadImage(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)
        let buffer = Buffer.from(data)
        let opt = {
            filename,
            contentType: mime ?? 'image/png'
        }
        const head = buffer.subarray(0, 14).toString()
        if (head.includes('WEBP') || head.includes('JFIF')) {
            this.bot.logger.info('检测消息含有可能无法发送的图片，即将尝试转换格式以修复该问题')
            const tmpPath = await saveTmp(buffer, head.includes('JFIF') ? 'jpeg' : 'webp')
            const { data, filename } = await image2png(tmpPath)
            unlink(tmpPath, noop)
            this.bot.logger.info('图片已转码为 png')
            buffer = data
            opt.filename = filename
            opt.contentType = 'image/png'
        }
        const payload = new FormData()
        payload.append('file', buffer, opt)
        return this.bot.internal.uploadFile(payload)
    }

    private async uploadAudio(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)

        let buffer = Buffer.from(data)
        let opt = {
            filename,
            contentType: mime ?? 'audio/amr'
        }

        const head = buffer.subarray(0, 7).toString()
        let duration = 0
        if (!head.includes('SILK')) {
            const tmpPath = await saveTmp(buffer)
            duration = await getDuration(tmpPath)
            const res = await audioTrans(tmpPath)
            buffer = await readFile(res.silkFile)
            unlink(res.silkFile, NOOP)
            opt.filename = basename(res.silkFile)
            opt.contentType = 'audio/amr'
        }

        const payload = new FormData()
        payload.append('file', buffer, opt)
        return { file: await this.bot.internal.uploadFile(payload), duration }
    }

    private async image(attrs: Dict) {
        const file = await this.uploadImage(attrs)

        let picType = 1000
        switch (file.imageInfo.type) {
            case 'gif':
                picType = 2000
                break
            case 'png':
                picType = 1001
                break
        }
        this.elements.push({
            elementType: 2,
            picElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: basename(file.ntFilePath),
                sourcePath: file.ntFilePath,
                picHeight: file.imageInfo.height,
                picWidth: file.imageInfo.width,
                picType
            }
        } as any)
    }

    private async file(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)
        const form = new FormData()
        form.append('file', data, {
            filename,
            contentType: mime ?? 'application/octet-stream'
        })
        const res = await this.bot.internal.uploadFile(form)
        this.elements.push({
            elementType: 3,
            fileElement: {
                fileName: basename(res.filePath),
                filePath: res.filePath,
                fileSize: String(res.fileSize),
                picThumbPath: {},
                thumbFileSize: 750,
            },
        } as any)
    }

    private async face(attrs: Dict) {
        let extras: Dict = {}
        const info = face.get(attrs.id)
        if (info.AniStickerType) {
            extras = {
                stickerType: info.AniStickerType,
                packId: info.AniStickerPackId,
                stickerId: info.AniStickerId,
                faceType: 3
            }
        }
        if (attrs['red:type']) {
            extras.faceType = attrs['red:type']
        }
        this.elements.push({ elementType: 6, faceElement: { faceIndex: attrs.id, ...extras } } as any)
    }

    private async audio(attrs: Dict) {
        const { data } = await this.bot.ctx.http.file(attrs.url, attrs)
        const file = await uploadAudio(Buffer.from(data))
        this.elements.push({
            elementType: 4,
            pttElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: file.md5 + '.amr',
                filePath: file.filePath,
                waveAmplitudes: [
                    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
                ],
                duration: file.duration
            }
        } as any)
    }

    private quote(attrs: Dict) {
        this.elements.push({
            elementType: 7,
            replyElement: {
                replayMsgId: attrs.id,
            }
        } as any)
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
                break
            }
            case 'at': {
                this.at(attrs)
                break
            }
            case 'image': {
                await this.image(attrs)
                break
            }
            case 'face': {
                if (attrs.platform && attrs.platform !== this.bot.platform) {
                    await this.render(children)
                } else {
                    this.face(attrs)
                }
                break
            }
            case 'figure': {
                await this.render(children)
                await this.flush()
                break
            }
            case 'p': {
                this.trim = true
                const prev = this.elements[this.elements.length - 1]
                if (prev?.elementType === 1 && prev?.textElement.atType === 0) {
                    if (!prev.textElement.content.endsWith('\n')) {
                        prev.textElement.content += '\n'
                    }
                } else {
                    this.text('\n')
                }
                await this.render(children)
                this.text('\n')
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
            default: {
                await this.render(children)
                break
            }
        }
    }
}