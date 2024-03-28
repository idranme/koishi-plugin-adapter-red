import { Quester } from 'koishi'
import * as Red from './types'

export class Internal {
    constructor(private http: Quester) { }

    uploadFile(file: FormData) {
        return this.http.post<Red.UploadResponse>('/api/upload', file)
    }

    removeGroupMembers(data: Red.GroupKickPayload) {
        return this.http.post<Red.GroupKickResponse>('/api/group/kick', data)
    }

    getGroupMembers(data: Red.GroupGetMemeberListPayload) {
        return this.http.post<any[]>('/api/group/getMemberList', data)
    }

    muteGroupMembers(data: Red.GroupMuteMemberPayload) {
        return this.http.post<Red.ResultResponse>('/api/group/muteMember', data)
    }

    getMe() {
        return this.http.get<Red.Profile>('/api/getSelfProfile')
    }

    getGroups() {
        return this.http.get<Red.GetGroupsResponse>('/api/bot/groups')
    }

    getFriends() {
        return this.http.get<Red.GetFriendsResponse>('/api/bot/friends')
    }

    deleteMessages(data: Red.MessageRecallPayload) {
        return this.http.post<Red.ResultResponse>('/api/message/recall', data)
    }

    getMessages(data: Red.MessageGetHistoryPayload) {
        return this.http.post('/api/message/getHistory', data)
    }

    sendMessage(data: Red.MessageSendPayload) {
        return this.http.post<Red.Message>('/api/message/send', data)
    }

    getFile(data: Red.MessageFetchRichMediaPayload) {
        return this.http('/api/message/fetchRichMedia', {
            method: 'POST',
            data,
            responseType: 'arraybuffer'
        })
    }

    getFileStream<T extends ReadableStream = ReadableStream>(data: Red.MessageFetchRichMediaPayload) {
        return this.http<T>('/api/message/fetchRichMedia', {
            method: 'POST',
            data,
            responseType: 'stream'
        })
    }

    muteGroup(data: Red.GroupMuteEveryonePayload) {
        return this.http.post('/api/group/muteEveryone', data)
    }
}