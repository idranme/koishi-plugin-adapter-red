import { Message, Group, Profile, Peer, Member } from './types'
import { Universal, h, Dict } from 'koishi'
import { RedBot } from './bot'
import * as face from 'qface'

export const decodeChannel = (guild: Group): Universal.Channel => ({
    id: guild.groupCode,
    name: guild.groupName,
    type: Universal.Channel.Type.TEXT
})

export const decodeGuild = (guild: Group): Universal.Guild => ({
    id: guild.groupCode,
    name: guild.groupName,
})

export const decodeUser = (user: Profile): Universal.User => ({
    id: user.uin,
    name: user.nick,
    avatar: user.avatarUrl ? user.avatarUrl + '640' : `http://q.qlogo.cn/headimg_dl?dst_uin=${user.uin}&spec=640`,
})

const roleMap = {
    2: 'member',
    3: 'admin',
    4: 'owner'
}

export const decodeGuildMember = ({ detail }: { detail: Member }): Universal.GuildMember => ({
    user: {
        id: detail.uin,
        name: detail.nick,
        avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${detail.uin}&spec=640`
    },
    nick: detail.cardName || detail.nick,
    roles: roleMap[detail.role] && [roleMap[detail.role]]
})

export const decodeEventUser = (data: Message): Universal.User => ({
    id: data.senderUin,
    name: data.sendNickName,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.senderUin}&spec=640`,
})

export const decodeEventGuildMember = (data: Message): Universal.GuildMember => ({
    user: decodeEventUser(data),
    nick: data.sendMemberName || data.sendNickName,
    roles: roleMap[data.roleType] && [roleMap[data.roleType]]
})

export const decodeEventGuild = (id: string, name: string): Universal.Guild => ({
    id,
    name,
    avatar: `https://p.qlogo.cn/gh/${id}/${id}/640`
})

export const decodeEventChannel = (channelId: string, guildId: string | undefined, name?: string): Universal.Channel => ({
    id: channelId,
    name,
    type: guildId ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT
})

export async function decodeMessage(
    bot: RedBot,
    data: Message,
    message: Universal.Message = {},
    payload: Universal.MessageLike = message
) {
    message.id = data.msgId

    const parse = async (data: Message, skipQuoteElement = false) => {
        const result: h[] = []
        for (const v of data.elements) {
            switch (v.elementType) {
                case 1: {
                    const { atType, atUid, content, atNtUin } = v.textElement
                    if (atType === 1) {
                        result.push(h('at', {
                            type: 'all'
                        }))
                        continue
                    }
                    if (atType === 2) {
                        result.push(h.at(atNtUin || atUid, {
                            name: content.replace('@', '')
                        }))
                        continue
                    }
                    result.push(h.text(v.textElement.content))
                    break
                }
                case 2: {
                    const { originImageUrl, picType, fileName, md5HexStr, picWidth, picHeight } = v.picElement
                    let mime = {
                        1000: 'image/jpeg',
                        1001: 'image/png',
                        1002: 'image/webp',
                        2000: 'image/gif',
                    }[picType]
                    if (!mime) {
                        const ext = fileName.split('.').at(-1)
                        switch (ext) {
                            case 'jpg':
                                mime = 'image/jpeg'
                                break
                            default:
                                mime = 'application/octet-stream'
                                break
                        }
                    }
                    let url: string
                    if (!originImageUrl) {
                        url = bot.redAssetsLocal.set(data, v.elementId, mime, md5HexStr)
                    } else if (originImageUrl.includes('&rkey')) {
                        url = bot.redAssetsLocal.set(data, v.elementId, mime, md5HexStr)
                    } else {
                        url = `https://c2cpicdw.qpic.cn${originImageUrl}`
                    }
                    result.push(h.image(url, {
                        width: picWidth,
                        height: picHeight
                    }))
                    break
                }
                case 3: {
                    //const file = await getFile(bot, data, v.elementId)
                    //result.push(h.file(file.data, file.headers['content-type']))
                    break
                }
                case 4: {
                    result.push(h.audio(bot.redAssetsLocal.set(data, v.elementId, 'audio/amr', (v.pttElement as any).md5HexStr)))
                    break
                }
                case 6: {
                    const { faceText, faceIndex, faceType } = v.faceElement as Dict
                    const name = faceText ? faceText.slice(1) : face.get(faceIndex).QDes.slice(1)
                    result.push(h('face', { id: faceIndex, name, platform: bot.platform, 'red:type': faceType }, [
                        h.image(face.getUrl(faceIndex))
                    ]))
                    break
                }
                case 7: {
                    if (skipQuoteElement) continue
                    const { senderUid, replayMsgSeq, replayMsgId } = v.replyElement as Dict
                    const msgId = replayMsgId !== '0' ? replayMsgId : bot.seqCache.get(`${data.chatType}/${data.peerUin}/${replayMsgSeq}`)
                    if (msgId) {
                        const record = data.records[0]
                        const elements = await parse(record, true)
                        message.quote = {
                            id: msgId,
                            user: {
                                id: senderUid,
                                name: record.sendMemberName || record.sendNickName
                            },
                            content: elements.join(''),
                            elements
                        }
                    } else {
                        //bot.logger.warn('由用户 %o (%o) 发送的消息的 quote 部分无法获取，请确保机器人保持运行状态。若无问题，可忽视此信息。', session.userId, session.author.name)
                    }
                    break
                }
            }
        }
        return result
    }

    message.elements = await parse(data)
    message.content = message.elements.join('')

    if (!payload) return message

    const [guildId, channelId] = decodeGuildChannelId(data)

    payload.user = decodeEventUser(data)
    payload.member = decodeEventGuildMember(data)
    payload.timestamp = +data.msgTime * 1000
    payload.guild = guildId && decodeEventGuild(guildId, data.peerName)
    payload.channel = decodeEventChannel(channelId, guildId, data.peerName)

    return message
}

const decodeGuildChannelId = (data: Message) => {
    if (data.chatType === 2) {
        return [data.peerUin, data.peerUin]
    } else if (data.chatType === 100) {
        return [undefined, 'private:temp_' + data.peerUin]
    } else {
        return [undefined, 'private:' + data.peerUin]
    }
}

export async function adaptSession(bot: RedBot, input: any) {
    const session = bot.session()
    if (input.type !== 'message::recv') return
    if (input.payload.length === 0) return

    const data: Message = input.payload[0]

    //console.log(data)

    bot.seqCache.set(`${data.chatType}/${data.peerUin}/${data.msgSeq}`, data.msgId)

    switch (data.msgType) {
        case 2:
        case 3:
        case 6:
        case 8:
        case 9: {
            session.type = 'message'
            session.subtype = data.chatType === 2 ? 'group' : 'private'
            await decodeMessage(bot, data, session.event.message = {}, session.event)
            if (!session.content) return
            return session
        }
    }

    const [guildId, channelId] = decodeGuildChannelId(data)

    session.timestamp = +data.msgTime * 1000
    session.event.channel = decodeEventChannel(channelId, guildId)

    if (data.msgType === 5 && data.subMsgType === 8) {
        const { type, memberUin, groupName, memberNick, adminUin } = data.elements[0].grayTipElement.groupElement
        if (type === 1) {
            session.type = 'guild-member-added'
            session.operatorId = adminUin
            session.event.user = {
                id: memberUin,
                name: memberNick,
                avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${memberUin}&spec=640`
            }
            session.guildId = guildId
        } else if (type === 5) {
            session.type = 'guild-updated'
            session.event.guild = decodeEventGuild(guildId, groupName)
            session.event.operator = {
                id: memberUin,
                name: memberNick
            }
        } else {
            return
        }
    } else if (data.msgType === 5 && data.subMsgType === 12) {
        const { content } = data.elements[0].grayTipElement.xmlElement
        if (!content) return
        const uins = content.match(/(?<=jp=")[0-9]+(?=")/g)
        if (!uins || uins.length !== 2) return
        session.type = 'guild-member-added'
        session.operatorId = uins[0]
        session.event.user = {
            id: uins[1],
            avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${uins[1]}&spec=640`
        }
        session.guildId = guildId
    } else {
        return
    }

    return session
}

export function getPeer(channelId: string): Peer {
    let peerUin = channelId
    let chatType: 1 | 2 | 100 = 2
    if (peerUin.includes('private:')) {
        peerUin = peerUin.split(':')[1]
        chatType = 1
        if (peerUin.startsWith('temp_')) {
            peerUin = peerUin.replace('temp_', '')
            chatType = 100
        }
    }
    return {
        chatType,
        peerUin
    }
}