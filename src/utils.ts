import { Message, Group, Profile, Peer, Member, WsPackage } from './types'
import { Universal, h, Session } from 'koishi'
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
    id: data.senderUin === '0' ? null : data.senderUin,
    name: data.sendNickName,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.senderUin}&spec=640`
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

export const decodeEventChannel = (channelId: string, guildId?: string, name?: string): Universal.Channel => ({
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

    const parse = async (data: Message, msgId: string, skipQuoteElement = false) => {
        const result: h[] = []
        for (const v of data.elements ?? []) {
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
                    const { originImageUrl, picType, fileName, md5HexStr, picWidth, picHeight, picSubType } = v.picElement
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
                    if (originImageUrl?.startsWith('/gchatpic_new')) {
                        url = `https://c2cpicdw.qpic.cn${originImageUrl}`
                    } else if (originImageUrl?.startsWith('/download') && originImageUrl.includes('rkey=')) {
                        url = `https://multimedia.nt.qq.com.cn${originImageUrl}`
                    }
                    url ||= bot.redAssets.set(data, v.elementId, mime, md5HexStr, msgId)
                    newElement = h.image(url, {
                        width: picWidth,
                        height: picHeight,
                        'red:face': picSubType === 1
                    })
                    break
                }
                case 3: {
                    // File
                    break
                }
                case 4: {
                    const url = bot.redAssets.set(data, v.elementId, 'audio/amr', v.pttElement.md5HexStr, msgId)
                    newElement = h.audio(url, { duration: v.pttElement.duration })
                    break
                }
                case 5: {
                    newElement = h.video(bot.redAssets.set(data, v.elementId, 'application/octet-stream', v.videoElement.videoMd5, msgId))
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
                    const { replayMsgSeq, replayMsgId } = v.replyElement
                    const msgId = replayMsgId !== '0' ? replayMsgId : bot.redSeq.get(`${data.chatType}/${data.peerUin}/${replayMsgSeq}`)
                    const record = data.records[0]
                    const elements = record && await parse(record, msgId ?? '', true)
                    message.quote = {
                        id: msgId,
                        user: {
                            id: record?.senderUin === '0' ? null : record?.senderUin,
                            name: record?.sendMemberName || record?.sendNickName
                        },
                        content: elements?.join?.(''),
                        elements
                    }
                    break
                }
            }
            newElement && result.push(newElement)
        }
        return result
    }

    const elements = await parse(data, data.msgId)
    if (bot.config.splitMixedContent) {
        for (const [index, item] of elements.entries()) {
            if (item.type !== 'img') continue
            const left = elements[index - 1]
            if (left?.type === 'text' && left.attrs.content.trimEnd() === left.attrs.content) {
                left.attrs.content += ' '
            }
            const right = elements[index + 1]
            if (right?.type === 'text' && right.attrs.content.trimStart() === right.attrs.content) {
                right.attrs.content = ' ' + right.attrs.content
            }
        }
    }

    message.elements = elements
    message.content = elements.join('')

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

export function setupGuildChannel(session: Session, data: Message, name?: string) {
    const [guildId, channelId] = decodeGuildChannelId(data)
    session.event.guild = guildId && decodeEventGuild(guildId, name ?? data.peerName)
    session.event.channel = decodeEventChannel(channelId, guildId, name ?? data.peerName)
}

export async function adaptSession(bot: RedBot, input: WsPackage<Message[]>) {
    const session = bot.session()

    if (input.payload.length === 0) return
    const data = input.payload[0]

    if (input.type === 'message::deleted') {
        session.type = 'message-deleted'
        session.messageId = data.msgId
        setupGuildChannel(session, data)
        return session
    }
    if (input.type !== 'message::recv') return

    bot.redSeq.set(`${data.chatType}/${data.peerUin}/${data.msgSeq}`, data.msgId)

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
            if (session.content.length === 0) return
            return session
        }
    }

    session.timestamp = +data.msgTime * 1000
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
            setupGuildChannel(session, data)
        } else if (type === 5) {
            session.type = 'guild-updated'
            session.event.operator = {
                id: memberUin,
                name: memberNick
            }
            setupGuildChannel(session, data, groupName)
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
        setupGuildChannel(session, data)
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

export function toUTF8String(input: ArrayBuffer, start = 0, end = input.byteLength) {
    return (new TextDecoder()).decode(input.slice(start, end))
}