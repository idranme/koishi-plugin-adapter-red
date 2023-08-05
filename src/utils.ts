import { Friend, WsEvents, Message } from './types'
import { Universal, h, Session, sleep } from 'koishi'
import { RedBot } from './bot'

export function genPack(type: string, payload: any) {
    return JSON.stringify({
        type,
        payload
    })
}

export const decodeUser = (user: Friend): Universal.User => ({
    userId: user.uin,
    avatar: user.avatarUrl + '640',
    username: user.nick
})

export const decodeAuthor = (meta: Message): Universal.Author => ({
    userId: meta.senderUin,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${meta.senderUin}&spec=640`,
    username: meta.sendNickName,
    nickname: meta.sendMemberName || meta.sendNickName,
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