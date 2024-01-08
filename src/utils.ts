import { Message, Group, Profile, Peer, Member, WsPackage } from './types'
import { Universal, h, Dict } from 'koishi'
import { RedBot } from './bot'
import { extname } from 'node:path'

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
            let newElement: h
            switch (v.elementType) {
                case 1: {
                    const { atType, atUid, content, atNtUin } = v.textElement
                    if (atType === 1) {
                        newElement = h('at', { type: 'all' })
                    }
                    if (atType === 2) {
                        newElement = h.at(atNtUin || atUid, { name: content.replace('@', '') })
                    }
                    newElement ||= h.text(v.textElement.content)
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
                    mime ||= {
                        '.jpg': 'image/jpeg'
                    }[extname(fileName)] ?? 'application/octet-stream'
                    let url: string
                    if (originImageUrl && !originImageUrl.includes('&rkey')) {
                        url = `https://c2cpicdw.qpic.cn${originImageUrl}`
                    }
                    url ||= bot.redAssets.set(data, v.elementId, mime, md5HexStr)
                    newElement = h.image(url, {
                        width: picWidth,
                        height: picHeight
                    })
                    break
                }
                case 3: {
                    // File
                    break
                }
                case 4: {
                    newElement = h.audio(bot.redAssets.set(data, v.elementId, 'audio/amr', v.pttElement.md5HexStr))
                    break
                }
                case 5: {
                    newElement = h.video(bot.redAssets.set(data, v.elementId, 'application/octet-stream', v.videoElement.videoMd5))
                    break
                }
                case 6: {
                    const { faceIndex, faceType, stickerType, packId, stickerId } = v.faceElement
                    let id = `${faceIndex}:${faceType}`
                    if (stickerType) {
                        id += `:${stickerType}:${packId}:${stickerId}`
                    }
                    newElement = h('face', { id, platform: bot.platform })
                    break
                }
                case 7: {
                    if (skipQuoteElement) continue
                    const { senderUid, replayMsgSeq, replayMsgId } = v.replyElement as Dict
                    const msgId = replayMsgId !== '0' ? replayMsgId : bot.seqCache.get(`${data.chatType}/${data.peerUin}/${replayMsgSeq}`)
                    if (msgId) {
                        const record = data.records[0]
                        const elements = record && await parse(record, true)
                        message.quote = {
                            id: msgId,
                            user: {
                                id: senderUid,
                                name: record?.sendMemberName || record?.sendNickName
                            },
                            content: elements?.join(''),
                            elements
                        }
                    }
                    break
                }
            }
            newElement && result.push(newElement)
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

export async function adaptSession(bot: RedBot, input: WsPackage<Message[]>) {
    const session = bot.session()
    if (input.type !== 'message::recv') return
    if (input.payload.length === 0) return

    const data = input.payload[0]

    bot.seqCache.set(`${data.chatType}/${data.peerUin}/${data.msgSeq}`, data.msgId)

    switch (data.msgType) {
        case 2:
        case 3:
        case 6:
        case 7:
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
        const { xmlElement } = data.elements[0].grayTipElement
        if (!xmlElement?.content) return
        const uins = xmlElement.content.match(/(?<=jp=")[0-9]+(?=")/g)
        if (uins?.length !== 2) return
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

export const toUTF8String = (input: Uint8Array, start = 0, end = input.length) => (new TextDecoder()).decode(input.slice(start, end))