import { Adapter, Schema } from 'koishi'
import { RedBot } from './bot'
import { genPack, decodeUser, adaptSession } from './utils'
import { WsEvents } from './types'

export class RedAdapter extends Adapter.WsClient<RedBot> {
    async prepare() {
        const { host } = new URL(this.bot.config.endpoint)
        this.bot.selfId = this.bot.config.selfId
        return this.bot.http.ws('ws://' + host)
    }

    accept() {
        this.bot.socket.addEventListener('message', async ({ data }) => {
            const parsed: WsEvents = JSON.parse(data.toString())
            if (parsed.type === 'meta::connect') {
                this.bot.redImplName = (parsed as WsEvents<'ConnectRecv'>).payload.name
                const selfId = (parsed as WsEvents<'ConnectRecv'>).payload.authData.uin
                if (selfId !== this.bot.selfId) {
                    return this.bot.socket.close(1008, `invalid selfId: ${selfId}`)
                }
                const user = decodeUser(await this.bot.internal.getSelfProfile())
                Object.assign(this.bot, user)
                return this.bot.online()
            }

            const session = await adaptSession(this.bot, parsed)
            if (session) this.bot.dispatch(session)
        })

        this.bot.internal._wsRequest = (type, payload) => {
            this.bot.socket.send(genPack(type, payload))
        }

        this.bot.internal._wsRequest('meta::connect', {
            token: this.bot.config.token
        })
    }
}

export namespace RedAdapter {
    export interface Config extends Adapter.WsClient.Config {
    }

    export const Config: Schema<Config> = Schema.intersect([
        Adapter.WsClient.Config,
    ] as const)
}