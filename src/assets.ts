import { Context, sanitize, trimSlash, Quester, Dict } from 'koishi'
import { RedBot } from './bot'
import { Message } from './types'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import { } from '@koishijs/plugin-server'

export class RedAssets<C extends Context = Context> {
    private path: string
    constructor(private bot: RedBot<C>, private config: RedBot.Config) {
        const num = Number(bot.selfId) || 0
        const unique = num.toString(32)
        this.path = sanitize(`${config.path || '/files'}/${unique}`)
        this.listen()
        bot.logger.info(`assets are located at ${this.selfUrl}${this.path}`)
    }
    set(message: Message, elementId: string, mime: string, md5: string) {
        const payload = Buffer.from(JSON.stringify({
            msgId: message.msgId,
            chatType: message.chatType,
            peerUid: message.peerUin,
            elementId,
            mime,
            md5
        })).toString('base64url')
        return `${this.selfUrl}${this.path}/${payload}`
    }
    private get selfUrl() {
        if (this.config.selfUrl) {
            return trimSlash(this.config.selfUrl)
        }
        let { host, port } = this.bot.ctx.server
        if (['0.0.0.0', '::'].includes(host)) host = '127.0.0.1'
        return this.bot.ctx.server.selfUrl || `http://${host}:${port}`
    }
    private listen() {
        this.bot.ctx.server.get(this.path, async (ctx) => {
            ctx.body = '200 OK'
            ctx.status = 200
        })
        this.bot.ctx.server.get(this.path + '/:data', async (ctx, next) => {
            const data = ctx.params['data']
            let payload: Dict
            if (data.endsWith('=')) {
                payload = JSON.parse(Buffer.from(data, 'base64').toString())
            } else {
                payload = JSON.parse(Buffer.from(data, 'base64url').toString())
            }
            const mime = payload.mime
            let file: Quester.Response<ReadableStream>
            try {
                file = await this.bot.internal.getFileStream({
                    msgId: payload.msgId,
                    chatType: payload.chatType,
                    peerUid: payload.peerUid,
                    elementId: payload.elementId,
                })
            } catch (err) {
                if (!Quester.Error.is(err)) {
                    throw err
                }
                if (mime.includes('image')) {
                    try {
                        file = await this.bot.ctx.http<ReadableStream>(`https://gchat.qpic.cn/gchatpic_new/0/0-0-${payload.md5.toUpperCase()}/0`, {
                            method: 'GET',
                            responseType: 'stream'
                        })
                    } catch { }
                }
                file ||= err.response
            }

            ctx.status = file.status
            const contentType = file.headers.get('content-type')
            if (contentType) {
                ctx.type = contentType
            } else if (file.status === 200) {
                ctx.type = mime
            }
            ctx.body = Readable.fromWeb(file.data)
            return next()
        })
    }
}