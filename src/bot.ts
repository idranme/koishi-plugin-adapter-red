import { Bot, Context, Schema, Quester } from 'koishi'
import { RedAdapter } from './adapter'
import { Internal } from './types'
import { RedMessageEncoder } from './message'
import { decodeGuildMember, decodeGuild } from './utils'

export class RedBot extends Bot<RedBot.Config> {
    static MessageEncoder = RedMessageEncoder
    http: Quester
    declare internal: Internal

    constructor(ctx: Context, config: RedBot.Config) {
        super(ctx, config)
        this.http = ctx.http.extend({
            ...config,
            endpoint: config.endpoint + '/api',
            headers: {
                Authorization: `Bearer ${config.token}`,
                ...config.headers,
            },
        })
        this.internal = new Internal(this.http)
        ctx.plugin(RedAdapter, this)
    }

    async getGuildList() {
        const data = await this.internal.getGroupList()
        return data.map(decodeGuild)
    }

    async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
        await this.internal.kick({
            group: guildId,
            uidList: [userId],
            refuseForever: permanent,
        })
    }

    async getGuildMemberList(guildId: string) {
        const data = await this.internal.getMemberList({
            group: guildId,
            size: 3000
        })
        return data.map(decodeGuildMember)
    }

    async deleteMessage(channelId: string, messageId: string) {
        const data = await this.internal.recall({
            msgIds: [messageId],
            peer: {
                guildId: null,
                peerUin: channelId,
                chatType: 2
            }
        })
        if(data.result === 5){
            await this.internal.recall({
                msgIds: [messageId],
                peer: {
                    guildId: null,
                    peerUin: channelId,
                    chatType: 1
                }
            })
        }
    }
}

export namespace RedBot {
    export interface Config extends Bot.Config, Quester.Config, RedAdapter.Config {
        token: string
    }

    export const Config: Schema<Config> = Schema.intersect([
        Schema.object({
            token: Schema.string().description('机器人的用户令牌。').role('secret').required(),
        }),
        RedAdapter.Config,
        Quester.createConfig('http://127.0.0.1:16530'),
    ])
}

RedBot.prototype.platform = 'red'