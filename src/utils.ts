import { Friend, WsEvents, Message, Group } from './types'
import { Universal, h, Dict } from 'koishi'
import { RedBot } from './bot'
import * as face from 'qface'
import FileType from 'file-type'

export function genPack(type: string, payload: any) {
    return JSON.stringify({
        type,
        payload
    })
}

export const decodeChannel = (guild: Group): Universal.Channel => ({
    id: guild.groupCode,
    name: guild.groupName,
    type: Universal.Channel.Type.TEXT
})

export const decodeGuild = (guild: Group): Universal.Guild => ({
    id: guild.groupCode,
    name: guild.groupName,
})

export const decodeFirendUser = (user: Friend): Universal.User => ({
    id: user.uin,
    name: user.nick,
    userId: user.uin,
    avatar: user.avatarUrl ? user.avatarUrl + '640' : `http://q.qlogo.cn/headimg_dl?dst_uin=${user.uin}&spec=640`,
    username: user.nick
})

export const decodeUser = (data: Message): Universal.User => ({
    id: data.senderUin,
    name: data.sendNickName,
    userId: data.senderUin,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.senderUin}&spec=640`,
    username: data.sendNickName,
})

const roleMap = {
    2: 'member',
    3: 'admin',
    4: 'owner'
}

export const decodeGuildMember = (data: Message): Universal.GuildMember => ({
    user: decodeUser(data),
    name: data.sendMemberName || data.sendNickName,
})

export async function decodeMessage(
    bot: RedBot,
    data: Message,
    message: Universal.Message = {},
    payload: Universal.MessageLike = message
) {
    message.id = message.messageId = data.msgId

    const elements = []
    if (data.elements) {
        for await (const v of data.elements) {
            if (v.elementType === 1) {
                // text
                const { atType, atUid, content, atNtUin } = v.textElement
                if (atType === 1) {
                    elements.push(h('at', {
                        type: 'all'
                    }))
                    continue
                }
                if (atType === 2) {
                    elements.push(h.at(atNtUin || atUid, {
                        name: content.replace('@', '')
                    }))
                    continue
                }
                elements.push(h.text(v.textElement.content))
            } else if (v.elementType === 2) {
                // image
                // picsubtype 为0是图片 为1是动画表情
                const file = await getFile(bot, data, v.elementId)
                //const url = 'file:///' + v.picElement.sourcePath.replaceAll('\\', '/')
                //elements.push(h.image(url))
                const { mime } = await FileType.fromBuffer(file.data)
                elements.push(h.image(file.data, mime))
            } else if (v.elementType === 4) {
                // audio
                const file = await getFile(bot, data, v.elementId)
                //const url = 'file:///' + (v.pttElement as any).filePath.replaceAll('\\', '/')
                //elements.push(h.audio(url))
                elements.push(h.audio(file.data, 'application/octet-stream'))
            } else if (v.elementType === 6) {
                // face
                const { faceText, faceIndex, faceType } = v.faceElement as Dict
                const name = faceText ? faceText.slice(1) : face.get(faceIndex).QDes.slice(1)
                elements.push(h('face', { id: faceIndex, name, platform: bot.platform, 'red:type': faceType }, [
                    h.image(face.getUrl(faceIndex))
                ]))
            } else if (v.elementType === 7) {
                // quote
                const { senderUid, replayMsgSeq, replayMsgId } = v.replyElement as Dict
                const msgId = replayMsgId !== '0' ? replayMsgId : bot.seqCache.get(data.peerUin + '/' + replayMsgSeq)
                if (msgId) {
                    message.quote = {
                        messageId: msgId,
                        user: {
                            id: senderUid
                        },
                        content: ''
                    }
                } else {
                    //bot.logger.warn('由用户 %o (%o) 发送的消息的 quote 部分无法获取，请确保机器人保持运行状态。若无问题，可忽视此信息。', session.userId, session.author.name)
                }
            }
        }
    }

    message.elements = elements
    message.content = elements.join('')

    if (!payload) return message

    const [guildId, channelId] = decodeGuildChannelId(data)

    payload.user = decodeUser(data)
    payload.member = decodeGuildMember(data)
    payload.timestamp = (data.msgTime as any) * 1000
    payload.guild = guildId && { id: guildId, name: data.peerName }
    payload.channel = channelId && { id: channelId, type: guildId ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT }
}

const decodeGuildChannelId = (data: Message) => {
    if (data.chatType === 2) {
        return [data.peerUin, data.peerUin]
    } else {
        return [undefined, 'private:' + data.peerUin]
    }
}

async function getFile(bot: RedBot, meta: Message, elementId: string) {
    return bot.http.axios('/message/fetchRichMedia', {
        method: 'POST',
        data: {
            msgId: meta.msgId,
            chatType: meta.chatType,
            peerUid: meta.peerUin,
            elementId,
        },
        responseType: 'arraybuffer'
    })
}

export async function adaptSession(bot: RedBot, input: WsEvents) {
    const session = bot.session()
    if (input?.type === 'message::recv') {
        if (input.payload.length === 0) return

        const data = input.payload[0]
        //console.log(data)
        //console.log(data.elements)

        bot.seqCache.set(data.peerUin + '/' + data.msgSeq, data.msgId)

        switch (data.msgType) {
            case 2:
            case 6:
            case 8:
            case 9: {
                session.type = 'message'
                session.isDirect = data.chatType === 1
                session.subtype = session.isDirect ? 'private' : 'group'
                await decodeMessage(bot, data, session.event.message = {}, session.event)
                if (!session.content) return
                return session
            }
        }

        session.messageId = data.msgId
        session.timestamp = (data.msgTime as any) * 1000
        session.userId = data.senderUin
        session.channelId = data.chatType === 1 ? 'private:' + data.peerUin : data.peerUin
        session.subtype = data.chatType === 1 ? 'private' : 'group'
        if (data.chatType === 2) {
            session.guildId = data.peerUin
        }

        switch (data.msgType) {
            case 3: {
                session.type = 'guild-file-added'
                /*const element = meta.elements[0]
                const file = await getFile(bot, meta, element.elementId)
                const { mime } = await FileType.fromBuffer(file.data)
                session.elements = [h.file(file.data, mime)]
                session.content = session.elements.join('')
                console.log(mime)*/
                break
            }
            case 5: {
                if (data.subMsgType === 8) {
                    const groupElement = data.elements[0].grayTipElement.groupElement as any
                    if (groupElement.type === 1) {
                        session.type = 'guild-member-added'
                        session.operatorId = groupElement.memberUin
                        session.event.user = {
                            id: groupElement.memberUin,
                            avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${groupElement.memberUin}&spec=640`
                        }
                    } else {
                        return
                    }
                } else if (data.subMsgType === 12) {
                    const { content } = data.elements[0].grayTipElement.xmlElement
                    const uins = content.match(/(?<=jp=")[0-9]+(?=")/g)
                    session.type = 'guild-member-added'
                    session.operatorId = uins[0]
                    session.event.user = {
                        id: uins[1],
                        avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${uins[1]}&spec=640`
                    }
                } else {
                    return
                }
                break
            }
            default:
                return
        }

    } else {
        return
    }
    return session
}