import { Friend, WsEvents, Message, Group } from './types'
import { Universal, h, Session, Dict, Logger } from 'koishi'
import { RedBot } from './bot'
import * as face from 'qface'
import FileType from 'file-type'

export function genPack(type: string, payload: any) {
    return JSON.stringify({
        type,
        payload
    })
}

export const decodeUser = (user: Friend): Universal.User => ({
    id: user.uin,
    name: user.nick,
    userId: user.uin,
    avatar: user.avatarUrl ? user.avatarUrl + '640' : `http://q.qlogo.cn/headimg_dl?dst_uin=${user.uin}&spec=640`,
    username: user.nick
})

export const decodeAuthor = (meta: Message): Universal.Author => ({
    id: meta.senderUin,
    name: meta.sendNickName,
    nick: meta.sendMemberName || meta.sendNickName,
    userId: meta.senderUin,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${meta.senderUin}&spec=640`,
    username: meta.sendNickName,
    nickname: meta.sendMemberName || meta.sendNickName,
})

const roleMap = {
    2: 'member',
    3: 'admin',
    4: 'owner'
}

export const decodeGuildMember = ({ detail }): Universal.GuildMember => ({
    ...decodeUser(detail),
    user: decodeUser(detail),
    nickname: detail.nick,
    roles: [roleMap[detail.role]]
})

export const decodeGuild = (info: Group): Universal.Guild => ({
    id: info.groupCode,
    name: info.groupName,
    guildId: info.groupCode,
    guildName: info.groupName
})

export async function decodeMessage(bot: RedBot, meta: Message, session: Partial<Session> = {}) {
    const elements = []
    if (meta.elements) {
        for await (const v of meta.elements) {
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
                const file = await getFile(bot, meta, v.elementId)
                //const url = 'file:///' + v.picElement.sourcePath.replaceAll('\\', '/')
                //elements.push(h.image(url))
                const { mime } = await FileType.fromBuffer(file.data)
                elements.push(h.image(file.data, mime))
            } else if (v.elementType === 4) {
                // audio
                const file = await getFile(bot, meta, v.elementId)
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
                const msgId = replayMsgId !== '0' ? replayMsgId : bot.seqCache.get(meta.peerUin + '/' + replayMsgSeq)
                if (msgId) {
                    session.quote = {
                        messageId: msgId,
                        userId: senderUid,
                        content: ''
                    }
                } else {
                    bot.logger.warn('由用户 %o (%o) 发送的消息的 quote 部分无法获取，请确保机器人保持运行状态。若无问题，可忽视此信息。', session.userId, session.author.name)
                }
            }
        }
    }

    session.elements = elements
    session.content = elements.join('')

    session.elements = h.parse(session.content)

    return session as Universal.Message
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
        const meta = input.payload[0]
        //console.log(meta)
        //console.log(meta.elements)

        bot.seqCache.set(meta.peerUin + '/' + meta.msgSeq, meta.msgId)

        session.messageId = meta.msgId
        session.timestamp = new Date(meta.msgTime).valueOf() || Date.now()
        session.author = decodeAuthor(meta)
        session.userId = meta.senderUin
        session.isDirect = meta.chatType === 1
        session.channelId = session.isDirect ? 'private:' + meta.peerUin : meta.peerUin
        session.subtype = session.isDirect ? 'private' : 'group'
        if (!session.isDirect) {
            session.guildId = meta.peerUin
        }

        switch (meta.msgType) {
            case 2:
            case 6:
            case 8:
            case 9: {
                session.type = 'message'
                await decodeMessage(bot, meta, session)
                if (session.elements.length === 0) return
                break
            }
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
                if (meta.subMsgType === 8) {
                    const groupElement = meta.elements[0].grayTipElement.groupElement as any
                    if (groupElement.type === 1) {
                        session.type = 'guild-member-added'
                        session.operatorId = groupElement.adminUin
                        const uin = groupElement.memberUin
                        session.author = {
                            userId: uin,
                            avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${uin}&spec=640`,
                            username: groupElement.memberNick,
                            nickname: groupElement.memberNick,
                        }
                        session.userId = uin
                    } else {
                        return
                    }
                } else if (meta.subMsgType === 12) {
                    const { content } = meta.elements[0].grayTipElement.xmlElement
                    const uins = content.match(/(?<=jp=")[0-9]+(?=")/g)
                    session.type = 'guild-member-added'
                    session.operatorId = uins[0]
                    session.author = {
                        userId: uins[1],
                        avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${uins[1]}&spec=640`
                    }
                    session.userId = uins[1]
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