import { Dict, h, MessageEncoder } from 'koishi'
import { RedBot } from './bot'
import { Element } from './types'
import FormData from 'form-data'
import * as face from 'qface'

export class RedMessageEncoder extends MessageEncoder<RedBot> {
    elements: Element[] = []

    async flush(): Promise<void> {
        this.bot.internal._wsRequest('message::send', {
            peer: {
                chatType: this.session.isDirect ? 1 : 2,
                peerUin: this.session.channelId,
                guildId: null
            },
            elements: this.elements
        })
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
        const { data, mime } = await this.bot.ctx.http.file(attrs.url, attrs)
        const payload = new FormData()
        // https://github.com/form-data/form-data/issues/468
        const value = process.env.KOISHI_ENV === 'browser'
            ? new Blob([data], { type: mime })
            : Buffer.from(data)
        payload.append('file', value)
        return this.bot.internal.uploadFile(payload)
    }

    private async image(attrs: Dict) {
        const file = await this.uploadAsset(attrs)
        this.elements.push({
            elementType: 2,
            picElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: file.md5 + '.' + file.ntFilePath.split('.').slice(-1),
                sourcePath: file.ntFilePath,
                picHeight: file.imageInfo.height,
                picWidth: file.imageInfo.width
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
        } else {
            await this.render(children)
        }
    }
}