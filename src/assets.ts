import { Context, sanitize, trimSlash } from 'koishi'
import { RedBot } from './bot'
import { Message } from './types'

export class RedAssetsLocal<C extends Context = Context> {
    private path: string
    constructor(private bot: RedBot<C>, private config: RedBot.Config) {
    }
    set(message: Message, elementId: string, mime?: string) {
        const payload = Buffer.from(JSON.stringify({
            msgId: message.msgId,
            chatType: message.chatType,
            peerUid: message.peerUin,
            elementId
        })).toString('base64')
        return `${this.selfUrl}${this.path}/${payload}${mime ? '?mime=' + encodeURIComponent(mime) : ''}`
    }
    get(data: string) {
        const payload = JSON.parse(Buffer.from(data, 'base64').toString())
        return this.bot.http.axios('/message/fetchRichMedia', {
            method: 'POST',
            data: {
                msgId: payload.msgId,
                chatType: payload.chatType,
                peerUid: payload.peerUid,
                elementId: payload.elementId,
            },
            responseType: 'arraybuffer'
        })
    }
    get selfUrl() {
        if (this.config.selfUrl) {
            return trimSlash(this.config.selfUrl)
        }
        return this.bot.ctx.router.selfUrl || `http://127.0.0.1:${this.bot.ctx.router.port}`
    }
    start() {
        this.path = sanitize(this.config.path || '/files')
        this.bot.ctx.router.get(this.path, async (ctx) => {
            ctx.body = '200 OK'
            ctx.status = 200
        });
        this.bot.ctx.router.get(this.path + '/:data', async (ctx) => {
            const response = await this.get(ctx.params['data'])
            ctx.body = response.data
            ctx.type = ctx.query['mime'] || response.headers['content-type']
            ctx.header['date'] = response.headers['date']
            ctx.status = response.status
        })
    }
}