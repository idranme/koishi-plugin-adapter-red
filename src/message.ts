import { Dict, h, MessageEncoder, Context } from 'koishi'
import { RedBot } from './bot'
import { MessageSendPayload } from './types'
import { audioTransPcm, wavToPcm } from './audio'
import { basename } from 'path'
import { decodeMessage, getPeer } from './utils'
import { isWavFile } from 'wav-file-decoder-cjs'
import { silkEncode, silkGetDuration } from './silk'
import { } from 'koishi-plugin-ffmpeg'

export class RedMessageEncoder<C extends Context = Context> extends MessageEncoder<C, RedBot<C>> {
    private payload: MessageSendPayload['elements'] = []
    private trim = false

    async flush() {
        if (this.payload.length === 0) return

        if (this.trim) {
            const first = this.payload[0]
            if (first?.elementType === 1 && first?.textElement.atType === 0) {
                if (first.textElement.content === '\n') {
                    this.payload.splice(0, 1)
                }
            }
            const last = this.payload.at(-1)
            if (last?.elementType === 1 && last?.textElement.atType === 0) {
                if (last.textElement.content === '\n') {
                    this.payload.splice(this.payload.length - 1, 1)
                } else if (last.textElement.content.endsWith('\n')) {
                    last.textElement.content = last.textElement.content.slice(0, -1)
                }
            }
            this.trim = false
        }

        const peer = getPeer(this.channelId)

        if (this.bot.redImplName === 'chronocat') {
            const res = await this.bot.internal.sendMessage({
                peer,
                elements: this.payload
            })

            this.bot.seqCache.set(`${res.chatType}/${res.peerUin}/${res.msgSeq}`, res.msgId)

            const session = this.bot.session()
            await decodeMessage(this.bot, res, session.event.message = {}, session.event)
            this.results.push(session.event.message)
            session.app.emit(session, 'send', session)
        } else {
            const payload: MessageSendPayload = {
                peer,
                elements: this.payload
            }
            this.bot.internal._wsRequest({
                type: 'message::send',
                payload
            })

            this.results.push({ id: '' })
        }

        this.payload = []
    }

    private text(content: string) {
        this.payload.push({
            elementType: 1,
            textElement: {
                atType: 0,
                content,
            }
        })
    }

    private at(attrs: Dict) {
        if (attrs.type === 'all') {
            this.payload.push({
                elementType: 1,
                textElement: {
                    content: '@全体成员',
                    atType: 1,
                }
            })
        } else {
            this.payload.push({
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
        const { data, mime } = await this.bot.ctx.http.file(attrs.url.toString(), attrs)
        const payload = new FormData()
        const blob = new Blob([data], { type: mime ?? 'application/octet-stream' })
        const ext = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
        }[mime]
        payload.append('file', blob, 'file' + (ext ?? ''))
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

        this.payload.push({
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
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)
        const form = new FormData()
        const blob = new Blob([data], { type: mime ?? 'application/octet-stream' })
        form.append('file', blob, filename)
        const res = await this.bot.internal.uploadFile(form)

        this.payload.push({
            elementType: 3,
            fileElement: {
                fileName: filename,
                filePath: res.filePath,
                fileSize: String(res.fileSize),
                thumbFileSize: 750,
            },
        })
    }

    private async face(attrs: Dict) {
        const [faceIndex, faceType, stickerType, packId, stickerId] = attrs.id.split(':')
        this.payload.push({ elementType: 6, faceElement: { faceIndex, faceType, stickerType, packId, stickerId } })
    }

    private async audio(attrs: Dict) {
        const { data } = await this.bot.ctx.http.file(attrs.url, attrs)
        let voice = new Uint8Array(data)
        let duration: number

        const head = (new TextDecoder()).decode(voice.subarray(0, 7))
        let pcm: { data: Uint8Array; sampleRate: number }
        if (isWavFile(voice)) {
            pcm = wavToPcm(voice)
        } else if (!head.includes('#!SILK')) {
            let data: Buffer
            const { ffmpeg } = this.bot.ctx
            const input = Buffer.from(voice)
            if (ffmpeg) {
                data = await ffmpeg.builder().input(input).outputOption('-ar', '24000', '-ac', '1', '-f', 's16le').run('buffer')
            } else {
                data = await audioTransPcm(input)
            }
            pcm = {
                data,
                sampleRate: 24000
            }
        }
        if (pcm) {
            const silk = await silkEncode(pcm.data, pcm.sampleRate)
            voice = silk.data
            duration = Math.round(silk.duration / 1000)
        }
        duration ||= Math.round((await silkGetDuration(voice)) / 1000)

        const payload = new FormData()
        const blob = new Blob([voice], { type: 'audio/amr' })
        payload.append('file', blob, 'file.amr')
        const file = await this.bot.internal.uploadFile(payload)

        this.payload.push({
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
        this.payload.push({
            elementType: 7,
            replyElement: {
                replayMsgId: attrs.id,
                senderUin,
                senderUinStr: senderUin
            }
        })
    }

    private async video(attrs: Dict) {
        const { data, filename, mime } = await this.bot.ctx.http.file(attrs.url, attrs)

        const payload = new FormData()
        const blob = new Blob([data], { type: mime ?? 'application/octet-stream' })
        payload.append('file', blob, filename)
        const file = await this.bot.internal.uploadFile(payload)

        this.payload.push({
            elementType: 5,
            videoElement: {
                filePath: file.ntFilePath,
                fileName: basename(file.ntFilePath),
                videoMd5: file.md5,
                thumbSize: 750,
                fileSize: String(file.fileSize),
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
                const prev = this.payload.at(-1)
                if (prev?.elementType === 1 && prev?.textElement.atType === 0) {
                    if (!prev.textElement.content.endsWith('\n')) {
                        prev.textElement.content += '\n'
                    }
                } else {
                    this.text('\n')
                }
                await this.render(children)
                const last = this.payload.at(-1)
                if (last?.elementType === 1 && last?.textElement.atType === 0) {
                    if (!last.textElement.content.endsWith('\n')) {
                        last.textElement.content += '\n'
                    }
                } else {
                    this.text('\n')
                }
                break
            }
            case 'br': {
                const prev = this.payload.at(-1)
                if (prev?.elementType === 1 && prev?.textElement.atType === 0) {
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