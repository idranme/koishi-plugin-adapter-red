import { Context, sanitize, trimSlash, Quester } from 'koishi'
import { RedBot } from './bot'
import { Message } from './types'
import {} from '@koishijs/plugin-server'

export class RedAssetsLocal<C extends Context = Context> {
    private path: string
    constructor(private bot: RedBot<C>, private config: RedBot.Config) {
    }
    set(message: Message, elementId: string, mime: string, md5: string) {
        const payload = Buffer.from(JSON.stringify({
            msgId: message.msgId,
            chatType: message.chatType,
            peerUid: message.peerUin,
            elementId,
            mime,
            md5
        })).toString('base64')
        return `${this.selfUrl}${this.path}/${payload}`
    }
    get(payload) {
        return this.bot.internal.getFile({
            msgId: payload.msgId,
            chatType: payload.chatType,
            peerUid: payload.peerUid,
            elementId: payload.elementId,
        })
    }
    get selfUrl() {
        if (this.config.selfUrl) {
            return trimSlash(this.config.selfUrl)
        }
        return this.bot.ctx.server.selfUrl || `http://127.0.0.1:${this.bot.ctx.server.port}`
    }
    start() {
        this.path = sanitize(this.config.path || '/files')
        this.bot.ctx.server.get(this.path, async (ctx) => {
            ctx.body = '200 OK'
            ctx.status = 200
        })
        this.bot.ctx.server.get(this.path + '/:data', async (ctx) => {
            const payload = JSON.parse(Buffer.from(ctx.params['data'], 'base64').toString())
            const mime = payload.mime
            let response: Quester.AxiosResponse
            try {
                response = await this.get(payload)
            } catch {
                if (mime.includes('image')) {
                    response = await this.bot.ctx.http.axios(`https://gchat.qpic.cn/gchatpic_new/0/0-0-${payload.md5.toUpperCase()}/0`, {
                        method: 'GET',
                        responseType: 'arraybuffer'
                    })
                }
            }
            ctx.body = response.data
            ctx.type = mime || response.headers['content-type']
            ctx.header['date'] = response.headers['date']
            ctx.status = response.status
        })
    }
}