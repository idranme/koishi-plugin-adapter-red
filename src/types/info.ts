import { Internal } from '.'

export interface Friend {
    qid: string;
    uin: string; // QQ 号
    nick: string;
    remark: string;
    longNick: string;
    avatarUrl: string;
    birthday_year: number;
    birthday_month: number;
    birthday_day: number;
    sex: number; // 性别
    topTime: string;
    isBlock: boolean; // 是否拉黑
    isMsgDisturb: boolean;
    isSpecialCareOpen: boolean;
    isSpecialCareZone: boolean;
    ringId: string;
    status: number;
    extStatus: number;
    categoryId: number;
    onlyChat: boolean;
    qzoneNotWatch: boolean;
    qzoneNotWatched: boolean;
    vipFlag: boolean;
    yearVipFlag: boolean;
    svipFlag: boolean;
    vipLevel: number;
    category: string; // 分组信息
}

export interface Group {
    groupCode: string; // 群号
    maxMember: number; // 最大人数
    memberCount: number; // 成员人数
    groupName: string; // 群名
    groupStatus: number;
    memberRole: number; // 群成员角色
    isTop: boolean;
    toppedTimestamp: string;
    privilegeFlag: number; // 群权限
    isConf: boolean;
    hasModifyConfGroupFace: boolean;
    hasModifyConfGroupName: boolean;
    remarkName: string;
    hasMemo: boolean;
    groupShutupExpireTime: string;
    personShutupExpireTime: string;
    discussToGroupUin: string;
    discussToGroupMaxMsgSeq: number;
    discussToGroupTime: number;
}


declare module './internal' {
    interface Internal {
        getSelfProfile(): Promise<Friend>
        getGroupList(): Promise<Group[]>
    }
}

Internal.define('/getSelfProfile', { GET: 'getSelfProfile' })
Internal.define('/bot/groups', { GET: 'getGroupList' })