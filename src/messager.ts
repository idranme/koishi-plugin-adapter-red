import { Dict, h, MessageEncoder, noop } from 'koishi'
import { RedBot } from './bot'
import { Element } from './types'
import FormData from 'form-data'
import * as face from 'qface'
import { saveTmp, audioTrans, getDuration, NOOP } from './assets'
import { unlink } from 'fs'
import { basename } from 'path'
import { readFile } from 'fs/promises'

export class RedMessageEncoder extends MessageEncoder<RedBot> {
    elements: Element[] = []
    trim = false

    async flush(): Promise<void> {
        if (this.elements.length === 0) return
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
        if (this.session.channelId.includes('private:')) {
            peerUin = this.session.channelId.split(':')[1]
            chatType = 1
        }
        let msgId = ''
        let sentTimestamp = undefined
        if (this.bot.redImplName === 'chronocat') {
            const res = await this.bot.internal.send({
                peer: {
                    chatType,
                    peerUin,
                    guildId: null
                },
                elements: this.elements
            })
            this.bot.seqCache.set(res.peerUin + '/' + res.msgSeq, res.msgId)
            msgId = res.msgId
            sentTimestamp = res.msgTime * 1000
        } else {
            this.bot.internal._wsRequest('message::send', {
                peer: {
                    chatType,
                    peerUin,
                    guildId: null
                },
                elements: this.elements
            })
        }
        const session = this.bot.session()
        session.type = 'send'
        session.messageId = msgId
        session.timestamp = sentTimestamp ?? +new Date()
        session.channelId = this.session.channelId
        if (chatType === 2) {
            session.guildId = peerUin
        }
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

    private async image(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url.toString(), attrs)
        let buffer = Buffer.from(data)
        let opt = {
            filename,
            contentType: mime ?? 'image/png'
        }
        const payload = new FormData()
        payload.append('file', buffer, opt)
        const file = await this.bot.internal.uploadFile(payload)

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
                picType,
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
                fileName: res.filePath.split('-').at(-1),
                filePath: res.filePath,
                fileSize: String(res.fileSize),
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
        const file = await this.bot.internal.uploadFile(payload)

        this.elements.push({
            elementType: 4,
            pttElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: basename(file.ntFilePath),
                filePath: file.ntFilePath,
                waveAmplitudes: [
                    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
                ],
                duration: duration
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

    private async video(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)
        let buffer = Buffer.from(data)
        let opt = {
            filename,
            contentType: mime ?? 'video/mp4'
        }
        const payload = new FormData()
        payload.append('file', buffer, opt)
        const file = await this.bot.internal.uploadFile(payload)

        this.elements.push({
            elementType: 5,
            videoElement: {
                filePath: file.ntFilePath,
                fileName: basename(file.ntFilePath),
                videoMd5: file.md5,
                thumbSize: 750,
                fileSize: String(file.fileSize),
            },
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
            case 'file': {
                await this.file(attrs)
                await this.flush()
                break
            }
            /*case 'video': {
                await this.video(attrs)
                await this.flush()
                break
            }*/
            default: {
                await this.render(children)
                break
            }
        }
    }
}