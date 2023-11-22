import { Dict, h, MessageEncoder, Context } from 'koishi'
import { RedBot } from './bot'
import { Element } from './types'
import FormData from 'form-data'
import * as face from 'qface'
import { audioTransPcm, wavToPcm, isWavFile } from './audio'
import { basename } from 'path'
import { decodeMessage } from './utils'
import { encode, getDuration } from 'silk-wasm'
import { } from 'koishi-plugin-ffmpeg'

const extMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
}

export class RedMessageEncoder<C extends Context = Context> extends MessageEncoder<C, RedBot<C>> {
    private elements: Element[] = []
    private trim = false

    async flush(): Promise<void> {
        if (this.elements.length === 0) return

        if (this.trim) {
            const first = this.elements[0]
            if (first?.elementType === 1 && first?.textElement.atType === 0) {
                if (first.textElement.content === '\n') {
                    this.elements.splice(0, 1)
                }
            }
            const last = this.elements.at(-1)
            if (last?.elementType === 1 && last?.textElement.atType === 0) {
                if (last.textElement.content === '\n') {
                    this.elements.splice(this.elements.length - 1, 1)
                } else if (last.textElement.content.endsWith('\n')) {
                    last.textElement.content = last.textElement.content.slice(0, -1)
                }
            }
        }

        let peerUin = this.channelId
        let chatType = 2
        if (peerUin.includes('private:')) {
            peerUin = peerUin.split(':')[1]
            chatType = 1
            if (peerUin.startsWith('temp_')) {
                peerUin = peerUin.replace('temp_', '')
                chatType = 100
            }
        }

        if (this.bot.redImplName === 'chronocat') {
            const res = await this.bot.internal.send({
                peer: {
                    chatType,
                    peerUin,
                    guildId: null
                },
                elements: this.elements
            })

            this.bot.seqCache.set(`${res.chatType}/${res.peerUin}/${res.msgSeq}`, res.msgId)

            const session = this.bot.session()
            await decodeMessage(this.bot, res, session.event.message = {}, session.event)
            this.results.push(session.event.message)
            session.app.emit(session, 'send', session)
        } else {
            this.bot.internal._wsRequest('message::send', {
                peer: {
                    chatType,
                    peerUin,
                    guildId: null
                },
                elements: this.elements
            })

            this.results.push({ id: '' })
        }

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
        const { data, mime } = await this.bot.ctx.http.file(attrs.url.toString(), attrs)
        const payload = new FormData()
        payload.append('file', Buffer.from(data), {
            filename: 'file' + extMap[mime] ?? '',
            contentType: mime ?? 'application/octet-stream'
        })
        const res = await this.bot.internal.uploadFile(payload)

        let picType = 1000
        switch (res.imageInfo.type) {
            case 'gif':
                picType = 2000
                break
            case 'png':
                picType = 1001
                break
            case 'webp':
                picType = 1002
                break
        }

        this.elements.push({
            elementType: 2,
            picElement: {
                md5HexStr: res.md5,
                fileSize: res.fileSize,
                fileName: basename(res.ntFilePath),
                sourcePath: res.ntFilePath,
                picHeight: res.imageInfo.height,
                picWidth: res.imageInfo.width,
                picType,
            }
        } as any)
    }

    private async file(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)
        const form = new FormData()
        form.append('file', Buffer.from(data), {
            filename,
            contentType: mime ?? 'application/octet-stream'
        })
        const res = await this.bot.internal.uploadFile(form)

        this.elements.push({
            elementType: 3,
            fileElement: {
                fileName: filename,
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
        const { data } = await this.bot.ctx.http.file(attrs.url, attrs)
        let voice = Buffer.from(data)

        const head = voice.subarray(0, 7)
        if (isWavFile(voice)) {
            const pcm = wavToPcm(voice)
            voice = Buffer.from(await encode(pcm.data, pcm.sampleRate))
        } else if (!head.includes('\x02#!SILK')) {
            let pcm: Buffer
            const { ffmpeg } = this.bot.ctx
            if (ffmpeg) {
                pcm = await ffmpeg.builder().input(voice).outputOption('-ar', '24000', '-ac', '1', '-f', 's16le').run('buffer')
            } else {
                pcm = await audioTransPcm(voice)
            }
            voice = Buffer.from(await encode(pcm, 24000))
        }
        const duration = Math.round(getDuration(voice) / 1000)

        const payload = new FormData()
        payload.append('file', voice, {
            filename: 'file.amr',
            contentType: 'audio/amr'
        })
        const file = await this.bot.internal.uploadFile(payload)

        this.elements.push({
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
            contentType: mime ?? 'application/octet-stream'
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
                const prev1 = this.elements.at(-1)
                if (prev1?.elementType === 1 && prev1?.textElement.atType === 0) {
                    if (!prev1.textElement.content.endsWith('\n')) {
                        prev1.textElement.content += '\n'
                    }
                } else {
                    this.text('\n')
                }
                await this.render(children)
                const prev2 = this.elements.at(-1)
                if (prev2?.elementType === 1 && prev2?.textElement.atType === 0) {
                    if (!prev2.textElement.content.endsWith('\n')) {
                        prev2.textElement.content += '\n'
                    }
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