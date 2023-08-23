import { Dict, h, MessageEncoder, noop } from 'koishi'
import { RedBot } from './bot'
import { Element } from './types'
import FormData from 'form-data'
import * as face from 'qface'
import { uploadAudio, saveTmp, image2png } from './assets'
import { unlink } from 'fs'

export class RedMessageEncoder extends MessageEncoder<RedBot> {
    elements: Element[] = []
    trim = false

    async flush(): Promise<void> {
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
        this.bot.internal._wsRequest('message::send', {
            peer: {
                chatType: this.session.isDirect ? 1 : 2,
                peerUin: this.session.channelId,
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

    private async uploadAsset(attrs: Dict) {
        const { data } = await this.bot.ctx.http.file(attrs.url, attrs)
        let buffer = Buffer.from(data)
        const head = buffer.subarray(0, 14).toString()
        if (head.includes('WEBP') || head.includes('JFIF')) {
            this.bot.logger.info('检测消息含有可能无法发送的图片，即将尝试转换格式以修复该问题')
            const tmpPath = await saveTmp(buffer, head.includes('JFIF') ? 'jpeg' : 'webp')
            buffer = await image2png(tmpPath)
            unlink(tmpPath, noop)
            this.bot.logger.info('图片已转码为 png')
        }
        const payload = new FormData()
        payload.append('file', buffer)
        return this.bot.internal.uploadFile(payload)
    }

    private async image(attrs: Dict) {
        const file = await this.uploadAsset(attrs)
        const picType = file.imageInfo.type === 'gif' ? 2000 : 1000
        this.elements.push({
            elementType: 2,
            picElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: file.md5 + '.' + file.ntFilePath.split('.').slice(-1),
                sourcePath: file.ntFilePath,
                picHeight: file.imageInfo.height,
                picWidth: file.imageInfo.width,
                picType
            }
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
        //console.log(file.filePath)
        this.elements.push({
            elementType: 4,
            pttElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: file.md5 + '.amr',
                filePath: file.filePath,
                waveAmplitudes: [8, 0, 40, 0, 56, 0],
                duration: file.duration
            }
        } as any)
    }

    private quote(attrs: Dict) {
        // 发送时会带 at
        this.elements.push({
            elementType: 7,
            replyElement: {
                replayMsgId: attrs.id
            }
        } as any)
    }

    async visit(element: h) {
        const { type, attrs, children } = element
        if (type === 'text') {
            this.text(attrs.content)
        } else if (type === 'message') {
            await this.flush()
            await this.render(children)
        } else if (type === 'at') {
            this.at(attrs)
        } else if (type === 'image') {
            await this.image(attrs)
        } else if (type === 'face') {
            if (attrs.platform && attrs.platform !== this.bot.platform) {
                await this.render(children)
            } else {
                this.face(attrs)
            }
        } else if (type === 'figure') {
            await this.render(children)
            await this.flush()
        } else if (type === 'p') {
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
        } else if (type === 'audio') {
            await this.audio(attrs)
            await this.flush()
        } else {
            await this.render(children)
        }
    }
}