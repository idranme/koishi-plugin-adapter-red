import { Bot, Context, Schema, Quester, Universal } from 'koishi'
import { WsClient } from './ws'
import { Message } from './types'
import { RedMessageEncoder } from './message'
import { decodeGuildMember, decodeGuild, decodeUser, decodeMessage, decodeChannel, getPeer } from './utils'
import { RedAssetsLocal } from './assets'
import { Internal } from './internal'

export class RedBot<C extends Context = Context> extends Bot<C, RedBot.Config> {
    static inject = {
        required: ['router'],
        optional: ['ffmpeg']
    }
    static MessageEncoder = RedMessageEncoder
    http: Quester
    internal: Internal
    redImplName: string
    seqCache = new Map()
    redAssetsLocal: RedAssetsLocal

    constructor(ctx: C, config: RedBot.Config) {
        super(ctx, config, 'red')
        this.selfId = config.selfId
        this.http = ctx.http.extend({
            ...config,
            endpoint: config.endpoint + '/api',
            headers: {
                Authorization: `Bearer ${config.token}`,
                ...config.headers,
            },
        })
        this.internal = new Internal(() => this.http)
        this.redAssetsLocal = new RedAssetsLocal(this, config)
        this.redAssetsLocal.start()
        ctx.plugin(WsClient, this)
    }

    async createDirectChannel(userId: string) {
        return { id: 'private:' + userId, type: Universal.Channel.Type.DIRECT }
    }

    async getGuildList(_next?: string) {
        const res = await this.internal.getGroups()
        return { data: res.map(decodeGuild) }
    }

    async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
        await this.internal.removeGroupMembers({
            group: guildId,
            uidList: [userId],
            refuseForever: permanent,
            reason: ''
        })
    }

    async getGuildMemberList(guildId: string, _next?: string) {
        const res = await this.internal.getGroupMembers({
            group: +guildId,
            size: 3000
        })
        return { data: res.map(decodeGuildMember) }
    }

    async getGuildMember(guildId: string, userId: string) {
        const res = await this.internal.getGroupMembers({
            group: +guildId,
            size: 3000
        })
        const member = res.find((element) => element.detail.uin === userId)
        return decodeGuildMember(member)
    }

    async deleteMessage(channelId: string, messageId: string) {
        await this.internal.deleteMessages({
            msgIds: [messageId],
            peer: getPeer(channelId)
        })
    }

    async muteGuildMember(guildId: string, userId: string, duration?: number, reason?: string) {
        await this.internal.muteGroupMembers({
            group: guildId,
            memList: [{
                uin: userId,
                timeStamp: + (duration / 1000).toFixed(0)
            }]
        })
    }

    async getFriendList(_next?: string) {
        const res = await this.internal.getFriends()
        return { data: res.map(decodeUser) }
    }

    async getMessageList(channelId: string, next?: string) {
        const res = await this.internal.getMessages({
            peer: getPeer(channelId),
            offsetMsgId: next,
            count: 100
        })
        const data = await Promise.all(res.msgList.map((data: Message) => decodeMessage(this, data)))
        return { data, next: data[0]?.id }
    }

    async getMessage(channelId: string, messageId: string) {
        const res = await this.internal.getMessages({
            peer: getPeer(channelId),
            offsetMsgId: messageId,
            count: 1
        })
        return await decodeMessage(this, res.msgList[0])
    }

    async getLogin() {
        const data = await this.internal.getMe()
        this.user = decodeUser(data)
        return this.toJSON()
    }

    async getChannelList(guildId: string) {
        const res = await this.internal.getGroups()
        const channel = res.find((element) => element.groupCode === guildId)
        return { data: [decodeChannel(channel)] }
    }
}

export namespace RedBot {
    export interface Config extends Quester.Config, WsClient.Config {
        token: string
        selfId: string
        path: string
        selfUrl: string
    }

    export const Config: Schema<Config> = Schema.intersect([
        Schema.object({
            token: Schema.string().description('用户令牌。').role('secret').required(),
            selfId: Schema.string().description('机器人的账号。').required(),
        }),
        Schema.object({
            path: Schema.string().default('/red_assets').description('静态资源（如图片）暴露在服务器的路径。'),
            selfUrl: Schema.string().role('link').description('Koishi 服务暴露在公网的地址。缺省时将使用全局配置。')
        }).description('资源设置'),
        WsClient.Config,
        Quester.createConfig('http://127.0.0.1:16530'),
    ])
}