import { Adapter, Schema, Context } from 'koishi'
import { RedBot } from './bot'
import { genPack, decodeUser, adaptSession, decodeFirendUser } from './utils'
import { WsEvents } from './types'

export class WsClient<C extends Context = Context> extends Adapter.WsClient<C, RedBot<C>> {
    async prepare() {
        const { host } = new URL(this.bot.config.endpoint)
        this.bot.selfId = this.bot.config.selfId
        return this.bot.http.ws('ws://' + host)
    }

    accept() {
        this.socket.addEventListener('message', async ({ data }) => {
            const parsed: WsEvents = JSON.parse(data.toString())
            if (parsed.type === 'meta::connect') {
                this.bot.redImplName = (parsed as WsEvents<'ConnectRecv'>).payload.name
                const selfId = (parsed as WsEvents<'ConnectRecv'>).payload.authData.uin
                if (selfId !== this.bot.selfId) {
                    return this.socket.close(1008, `invalid selfId: ${selfId}`)
                }
                this.bot.user = decodeFirendUser(await this.bot.internal.getSelfProfile())
                return this.bot.online()
            }

            const session = await adaptSession(this.bot, parsed)
            if (session) this.bot.dispatch(session)
        })

        this.bot.internal._wsRequest = (type, payload) => {
            this.socket.send(genPack(type, payload))
        }

        this.bot.internal._wsRequest('meta::connect', {
            token: this.bot.config.token
        })
    }
}

export namespace WsClient {
    export interface Config extends Adapter.WsClientConfig {
    }

    export const Config: Schema<Config> = Schema.intersect([
        Adapter.WsClientConfig,
    ] as const)
}