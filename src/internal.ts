import { Quester } from 'koishi'
import * as Red from './types'

export class Internal {
    _wsRequest?<P extends object>(data: Red.WsPackage<P>): void

    constructor(private http: () => Quester) { }

    uploadFile(file: FormData) {
        return this.http().post<Red.UploadResponse>('/upload', file)
    }

    removeGroupMembers(data: Red.GroupKickPayload) {
        return this.http().post<Red.ResultResponse>('/group/kick', data)
    }

    getGroupMembers(data: Red.GroupGetMemeberListPayload) {
        return this.http().post<any[]>('/group/getMemberList', data)
    }

    muteGroupMembers(data: Red.GroupMuteMemberPayload) {
        return this.http().post<Red.ResultResponse>('/group/muteMember', data)
    }

    getMe() {
        return this.http().post<Red.Profile>('/getSelfProfile')
    }

    getGroups() {
        return this.http().post<Red.GetGroupsResponse>('/bot/groups')
    }

    getFriends() {
        return this.http().post<Red.GetFriendsResponse>('/bot/friends')
    }

    deleteMessages(data: Red.MessageRecallPayload) {
        return this.http().post<Red.ResultResponse>('/message/recall', data)
    }

    getMessages(data: Red.MessageGetHistoryPayload) {
        return this.http().post('/message/getHistory', data)
    }

    sendMessage(data: Red.MessageSendPayload) {
        return this.http().post<Red.Message>('/message/send', data)
    }

    getFile(data: Red.MessageFetchRichMediaPayload) {
        return this.http().axios('/message/fetchRichMedia', {
            method: 'POST',
            data,
            responseType: 'arraybuffer'
        })
    }

    muteGroup(data: Red.GroupMuteEveryonePayload) {
        return this.http().post('/group/muteEveryone', data)
    }
}