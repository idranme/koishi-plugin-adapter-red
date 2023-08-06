import { Friend, WsEvents, Message, Group } from './types'
import { Universal, h, Session, sleep, Dict } from 'koishi'
import { RedBot } from './bot'
import * as face from 'qface'

export function genPack(type: string, payload: any) {
    return JSON.stringify({
        type,
        payload
    })
}

export const decodeUser = (user: Friend): Universal.User => ({
    userId: user.uin,
    avatar: user.avatarUrl ? user.avatarUrl + '640' : `http://q.qlogo.cn/headimg_dl?dst_uin=${user.uin}&spec=640`,
    username: user.nick
})

export const decodeAuthor = (meta: Message): Universal.Author => ({
    userId: meta.senderUin,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${meta.senderUin}&spec=640`,
    username: meta.sendNickName,
    nickname: meta.sendMemberName || meta.sendNickName,
})

export const decodeGuildMember = ({ detail }): Universal.GuildMember => ({
    userId: detail.uin,
    username: detail.nick,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${detail.uin}&spec=640`,
    nickname: detail.nick
})

export const decodeGuild = (info: Group): Universal.Guild => ({
    guildId: info.groupCode,
    guildName: info.groupName
})

export async function decodeMessage(bot: RedBot, meta: Message, session: Partial<Session> = {}) {
    session.messageId = meta.msgId
    session.timestamp = new Date(meta.msgTime).valueOf() || Date.now()
    session.author = decodeAuthor(meta)
    session.userId = meta.senderUin
    session.isDirect = meta.chatType === 1
    session.channelId = meta.peerUin

    if (!session.isDirect) {
        session.guildId = meta.peerUin
    }

    const elements = []
    if (meta.elements) {
        //console.log(meta.elements)
        for await (const v of meta.elements) {
            if (v.elementType === 1) {
                // text
                const { atType, atNtUin, content } = v.textElement
                if (atType === 1) {
                    elements.push(h('at', {
                        type: 'all'
                    }))
                    continue
                }
                if (atType === 2) {
                    elements.push(h.at(atNtUin, {
                        name: content.replace('@', '')
                    }))
                    continue
                }
                elements.push(h.text(v.textElement.content))
            } else if (v.elementType === 2) {
                // image
                const { sourcePath, picSubType } = v.picElement
                // picsubtype 为0是图片 为1是动画表情
                let fileUrl = 'file:///' + sourcePath.replaceAll('\\', '/')
                if (picSubType === 0) {
                    fileUrl = fileUrl.replace('Ori', 'Thumb').replace('Ori', 'Thumb').replace('.', '_720.')
                }
                const getImage = async () => {
                    try {
                        const { data, mime } = await bot.ctx.http.file(fileUrl)
                        elements.push(h.image(data, mime))
                    } catch {
                        await sleep(75)
                        await getImage()
                    }
                }
                await getImage()
            } else if (v.elementType === 6) {
                const { faceText, faceIndex, faceType } = v.faceElement as Dict
                const name = faceText ? faceText.slice(1) : face.get(faceIndex).QDes.slice(1)
                elements.push(h('face', { id: faceIndex, name, platform: bot.platform, 'red:type': faceType }, [
                    h.image(face.getUrl(faceIndex))
                ]))
            } else if (v.elementType === 7) {
                /*const { sourceMsgIdInRecords, senderUid } = v.replyElement as Dict
                session.quote = {
                    userId: senderUid,
                    messageId: sourceMsgIdInRecords
                }
                elements.push(h.quote(sourceMsgIdInRecords))*/
            }
        }
    }

    session.elements = elements
    session.content = elements.join('')

    session.elements = h.parse(session.content)

    return session as Universal.Message
}

export async function adaptSession(bot: RedBot, input: WsEvents) {
    //console.log(input)
    const session = bot.session()
    if (input.type === 'message::recv') {
        session.type = 'message'
        await decodeMessage(bot, input.payload[0], session)
        if (session.elements.length === 0) return
    } else {
        return
    }
    return session
}