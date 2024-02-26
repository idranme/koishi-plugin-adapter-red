import { Bot, Context, Schema, Quester, Universal, trimSlash } from 'koishi'
import { WsClient } from './ws'
import { Message } from './types'
import { RedMessageEncoder } from './message'
import { decodeGuildMember, decodeGuild, decodeUser, decodeMessage, decodeChannel, getPeer } from './utils'
import { RedAssets } from './assets'
import { Internal } from './internal'

export class RedBot<C extends Context = Context> extends Bot<C, RedBot.Config> {
    static inject = {
        required: ['server', 'http'],
        optional: ['ffmpeg', 'silk']
    }
    static MessageEncoder = RedMessageEncoder
    http: Quester
    internal: Internal
    redSeq = new Map()
    redAssets: RedAssets

    constructor(ctx: C, config: RedBot.Config) {
        super(ctx, config, 'red')
        this.selfId = config.selfId
        this.http = ctx.http.extend({
            ...config,
            headers: {
                Authorization: `Bearer ${config.token}`,
                ...config.headers,
            },
        })
        this.internal = new Internal(this.http)
        setTimeout(() => {
            this.redAssets = new RedAssets(this, config)
        }, 0)
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
        const res = await this.internal.removeGroupMembers({
            group: guildId,
            uidList: [userId],
            refuseForever: permanent,
            reason: ''
        })
        if (res.errCode !== 0) {
            if (res.errCode === 316) {
                throw new Error('user code is invaild')
            }
            throw new Error(res.errMsg)
        }
        if (res.resultList[0]?.result !== 0) {
            throw new Error('unknown anomaly')
        }
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
        if (!member) throw new Error(`member ${userId} was not found in group ${guildId}`)
        return decodeGuildMember(member)
    }

    async deleteMessage(channelId: string, messageId: string) {
        await this.internal.deleteMessages({
            msgIds: [messageId],
            peer: getPeer(channelId)
        })
    }

    async muteGuildMember(guildId: string, userId: string, duration?: number, reason?: string) {
        const res = await this.internal.muteGroupMembers({
            group: guildId,
            memList: [{
                uin: userId,
                timeStamp: + (duration / 1000).toFixed(0)
            }]
        })
        if (res.result === 316) {
            throw new Error('USERID_IS_INVAILD')
        }
        if (res.result !== 0) {
            if (res.errMsg.startsWith('ERR_')) {
                throw new Error(res.errMsg.replace('ERR_', ''))
            }
            throw new Error('UNKNOWN_ANOMALY')
        }
    }

    async getFriendList(_next?: string) {
        const res = await this.internal.getFriends()
        return { data: res.map(decodeUser) }
    }

    async getUser(userId: string) {
        //const res = await this.internal.getFriends()
        //const user = res.find((element) => element.uin === userId)
        return {
            id: userId,
            avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640`
        }
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
    export interface Config extends Quester.Config, WsClient.Options {
        token: string
        selfId: string
        path: string
        selfUrl: string
        splitMixedContent: boolean
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
        WsClient.Options,
        Quester.createConfig('http://127.0.0.1:16530/'),
        Schema.object({
            splitMixedContent: Schema.boolean().default(false).description('是否自动在接收到的混合内容间插入空格。')
        }).description('高级设置'),
    ])
}