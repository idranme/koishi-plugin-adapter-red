import { Bot, Context, Schema, Quester, Logger, Universal } from 'koishi'
import { RedAdapter } from './adapter'
import { Internal } from './types'
import { RedMessageEncoder } from './message'
import { decodeGuildMember, decodeGuild, decodeUser } from './utils'

export class RedBot extends Bot<RedBot.Config> {
    static MessageEncoder = RedMessageEncoder
    http: Quester
    logger: Logger
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
        this.platform = 'red'
        this.logger = ctx.logger('red')
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
        if (data.result === 5) {
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

    async muteGuildMember(guildId: string, userId: string, duration?: number, reason?: string) {
        await this.internal.muteMember({
            group: guildId,
            memList: [{
                uin: userId,
                timeStamp: + (duration / 1000).toFixed(0)
            }]
        })
    }

    async getFriendList() {
        const data = await this.internal.getFriendList()
        return data.map(decodeUser)
    }

    /*
    async getMessageList(channelId: string, before?: string) {
        const data = await this.internal.getHistory({
            peer: {
                guildId: null,
                peerUin: channelId,
                chatType: 2
            },
            count: 50
        })
        console.log(data)
    }
    */

    async getSelf() {
        const data = await this.internal.getSelfProfile()
        return decodeUser(data)
    }
}

export namespace RedBot {
    export interface Config extends Bot.Config, Quester.Config, RedAdapter.Config {
        token: string
    }

    export const Config: Schema<Config> = Schema.intersect([
        Schema.object({
            token: Schema.string().description('用户令牌。').role('secret').required(),
            selfId: Schema.string().description('机器人的账号。').required(),
        }),
        RedAdapter.Config,
        Quester.createConfig('http://127.0.0.1:16530'),
    ])
}