import { Bot, Context, Schema, Quester, Logger, Universal } from 'koishi'
import { WsClient } from './ws'
import { Internal, Message } from './types'
import { RedMessageEncoder } from './message'
import { decodeGuildMember, decodeGuild, decodeFirendUser, decodeMessage, decodeChannel } from './utils'
import { RedAssetsLocal } from './assets'

export class RedBot<C extends Context = Context> extends Bot<C, RedBot.Config> {
    static MessageEncoder = RedMessageEncoder
    static inject = {
        required: ['router'],
        optional: ['ffmpeg']
    }
    http: Quester
    logger: Logger
    declare internal: Internal
    redImplName: string
    seqCache = new Map()
    redAssetsLocal: RedAssetsLocal

    constructor(ctx: C, config: RedBot.Config) {
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
        this.redAssetsLocal = new RedAssetsLocal(this, config)
        this.redAssetsLocal.start()
        ctx.plugin(WsClient, this)
    }

    async createDirectChannel(userId: string) {
        return { id: 'private:' + userId, type: Universal.Channel.Type.DIRECT }
    }

    async getGuildList(_next?: string) {
        const res = await this.internal.getGroupList()
        return { data: res.map(decodeGuild) }
    }

    async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {
        await this.internal.kick({
            group: guildId,
            uidList: [userId],
            refuseForever: permanent,
        })
    }

    async getGuildMemberList(guildId: string, _next?: string) {
        const res = await this.internal.getMemberList({
            group: guildId,
            size: 3000
        })
        return { data: res.map(decodeGuildMember) }
    }

    async getGuildMember(guildId: string, userId: string) {
        const res = await this.internal.getMemberList({
            group: guildId,
            size: 3000
        })
        const member = res.find((element) => element.detail.uin === userId)
        return decodeGuildMember(member)
    }

    async deleteMessage(channelId: string, messageId: string) {
        let peerUin = channelId
        let chatType = 2
        if (channelId.includes('private:')) {
            peerUin = channelId.split(':')[1]
            chatType = 1
        }
        await this.internal.recall({
            msgIds: [messageId],
            peer: {
                guildId: null,
                peerUin,
                chatType
            }
        })
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

    async getFriendList(_next?: string) {
        const res = await this.internal.getFriendList()
        return { data: res.map(decodeFirendUser) }
    }

    async getMessageList(channelId: string, next?: string) {
        let peerUin = channelId
        let chatType = 2
        if (channelId.includes('private:')) {
            peerUin = channelId.split(':')[1]
            chatType = 1
        }
        const res = await this.internal.getHistory({
            peer: {
                guildId: null,
                peerUin,
                chatType
            },
            offsetMsgId: next,
            count: 100
        })
        const data = await Promise.all(res.msgList.map((data: Message) => decodeMessage(this, data)))
        return { data, next: data[0]?.id }
    }

    async getMessage(channelId: string, messageId: string) {
        let peerUin = channelId
        let chatType = 2
        if (channelId.includes('private:')) {
            peerUin = channelId.split(':')[1]
            chatType = 1
        }
        const res = await this.internal.getHistory({
            peer: {
                guildId: null,
                peerUin,
                chatType
            },
            offsetMsgId: messageId,
            count: 1
        })
        return await decodeMessage(this, res.msgList[0])
    }

    async getLogin() {
        const data = await this.internal.getSelfProfile()
        this.user = decodeFirendUser(data)
        return this.toJSON()
    }

    async getChannelList(guildId: string) {
        const res = await this.internal.getGroupList()
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