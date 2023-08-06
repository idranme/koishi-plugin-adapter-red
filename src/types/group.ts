import { Internal } from '.'

export interface Kick {
    uidList: string[]
    group: string // 群号
    refuseForever: boolean // 永踢
    reason?: string
}

export interface GetMemberList {
    group: string, // 群号
    size: number // 个数
}

export interface MuteMember {
    group: string
    memList: {
        uin: string
        timeStamp: number //秒
    }[]
}

declare module './internal' {
    interface Internal {
        kick(data: Kick): Promise<unknown>
        getMemberList(data: GetMemberList): Promise<any[]>
        muteMember(data: MuteMember): Promise<unknown>
    }
}

Internal.define('/group/kick', { POST: 'kick' })
Internal.define('/group/getMemberList', { POST: 'getMemberList' })
Internal.define('/group/muteMember', { POST: 'muteMember' })