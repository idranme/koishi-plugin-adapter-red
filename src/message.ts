import { Dict, h, MessageEncoder } from 'koishi'
import { RedBot } from './bot'
import { Element } from './types'
import FormData from 'form-data'
import { createReadStream } from 'fs'

export class RedMessageEncoder extends MessageEncoder<RedBot> {
    children: Element[] = []

    async flush(): Promise<void> {
        this.bot.internal._wsRequest('message::send', {
            peer: {
                chatType: this.session.isDirect ? 1 : 2,
                peerUin: this.session.channelId,
                guildId: null
            },
            elements: this.children
        })
    }

    private text(content: string) {
        this.children.push({
            elementType: 1,
            textElement: {
                atType: 0,
                content,
            }
        } as any)
    }

    private at(attrs: Dict) {
        if (attrs.type === 'all') {
            this.children.push({
                elementType: 1,
                textElement: {
                    content: '@全体成员',
                    atType: 1,
                }
            } as any)
        } else {
            this.children.push({
                elementType: 1,
                textElement: {
                    content: attrs.name ? '@' + attrs.name : undefined,
                    atType: 2,
                    atNtUin: attrs.id
                },
            } as any)
        }
    }

    private async uploadAsset(url: string) {
        const payload = new FormData()
        const [schema, file] = url.split('://')
        if (schema === 'file') {
            payload.append('file', createReadStream(file))
        } else if (schema === 'base64') {
            payload.append('file', Buffer.from(file, 'base64'))
        } else {
            const resp = await this.bot.ctx.http.get(url, { responseType: 'stream' })
            payload.append('file', resp)
        }
        return await this.bot.internal.uploadFile(payload)
    }

    private async image(attrs: Dict) {
        const file = await this.uploadAsset(attrs.url)
        this.children.push({
            elementType: 2,
            picElement: {
                md5HexStr: file.md5,
                fileSize: file.fileSize,
                fileName: file.md5 + '.' + file.imageInfo.type,
                sourcePath: file.ntFilePath,
                picHeight: file.imageInfo.height,
                picWidth: file.imageInfo.width
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
        }
    }
}