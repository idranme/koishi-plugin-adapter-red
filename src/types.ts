export type OptionalDeep<O> = {
    [K in keyof O]?: OptionalDeep<O[K]>
}

export interface WsPackage<P extends object = Record<string, unknown>> {
    type: string
    payload: P
}

export interface MetaConnectPayload {
    token: string
}

export interface ResultResponse {
    result: number
    errMsg: string
}

export interface MetaConnectResponse {
    version: string
    name: 'red-protocol' | 'chronocat'
    authData: {
        account: string
        mainAccount: string
        uin: string
        uid: string
        nickName: string
        gender: number
        age: number
        faceUrl: string
        a2: string
        d2: string
        d2key: string
    }
}

export interface Profile {
    uid: string
    qid: string
    uin: string
    nick: string
    remark: string
    longNick: string
    avatarUrl: string
    birthday_year: number
    birthday_month: number
    birthday_day: number
    sex: number
    topTime: string
    isBlock: boolean
    isMsgDisturb: boolean
    isSpecialCareOpen: boolean
    isSpecialCareZone: boolean
    ringId: string
    status: number
    extStatus: number
    categoryId: number
    onlyChat: boolean
    qzoneNotWatch: boolean
    qzoneNotWatched: boolean
    vipFlag: boolean
    yearVipFlag: boolean
    svipFlag: boolean
    vipLevel: number
}

export interface Member {
    uid: string
    qid: string
    uin: string
    nick: string
    remark: string
    cardType: number
    cardName: string
    role: number
    avatarPath: string
    shutUpTime: number
    isDelete: boolean
}

export interface Peer {
    chatType: 1 | 2 | 100
    peerUid?: string
    peerUin: string
    guildId?: string
}

export interface MessageSendPayload {
    peer: Peer
    elements: OptionalDeep<Element>[]
}

export interface UploadResponse {
    md5: string
    imageInfo?: {
        width: number
        height: number
        type: string // png
        mime: string // image/png
        wUnits: string // px
        hUnits: string // px
    }
    fileSize: number
    filePath: string
    ntFilePath: string
}

export interface Group {
    groupCode: string
    maxMember: number
    memberCount: number
    groupName: string
    groupStatus: number
    memberRole: number
    isTop: boolean
    toppedTimestamp: string
    privilegeFlag: number
    isConf: boolean
    hasModifyConfGroupFace: boolean
    hasModifyConfGroupName: boolean
    remarkName: string
    avatarUrl: string
    hasMemo: boolean
    groupShutupExpireTime: string
    personShutupExpireTime: string
    discussToGroupUin: string
    discussToGroupMaxMsgSeq: number
    discussToGroupTime: number
}

export type GetGroupsResponse = Group[]

export type GetFriendsResponse = {
    uid: string
    qid: string
    uin: string
    nick: string
    remark: string
    longNick: string
    avatarUrl: string
    birthday_year: number
    birthday_month: number
    birthday_day: number
    sex: number
    topTime: string
    isBlock: boolean
    isMsgDisturb: boolean
    isSpecialCareOpen: boolean
    isSpecialCareZone: boolean
    ringId: string
    status: number
    extStatus: number
    categoryId: number
    onlyChat: boolean
    qzoneNotWatch: boolean
    qzoneNotWatched: boolean
    vipFlag: boolean
    yearVipFlag: boolean
    svipFlag: boolean
    vipLevel: number
    category: string
}[]

export enum ChatType {
    PrivateTemp = 100,
    Private = 1,
    Group = 2,
}

export enum MsgType {
    /**
     * 普通消息。
     */
    Normal = 2,

    Value3 = 3,

    /**
     * 系统通知。
     */
    System = 5,

    /**
     * 语音消息。
     */
    Ptt = 6,

    /**
     * 视频消息。
     */
    Video = 7,

    Value8 = 8,

    /**
     * 带 Quote 消息。
     */
    WithRecords = 9,

    /**
     * 红包消息。
     */
    Wallet = 10,

    /**
     * 卡片消息。
     */
    Ark = 11,

    Vaule17 = 17,
}

export enum SendType {
    Normal = 0,
    System = 3,
}

export interface Message {
    msgId: string
    msgRandom: string
    msgSeq: string
    cntSeq: string
    chatType: ChatType
    msgType: MsgType
    subMsgType: number
    sendType: SendType
    senderUid: string
    peerUid: string
    channelId: string
    guildId: string
    guildCode: string
    fromUid: string
    fromAppid: string
    msgTime: string
    msgMeta: string
    sendStatus: number
    sendMemberName: string
    sendNickName: string
    guildName: string
    channelName: string
    elements: Element[]
    records: Message[]
    emojiLikesList: unknown[]
    commentCnt: string
    directMsgFlag: number
    directMsgMembers: unknown[]
    peerName: string
    editable: boolean
    avatarMeta: string
    avatarPendant: string
    feedId: string
    roleId: string
    timeStamp: string
    isImportMsg: boolean
    atType: number
    roleType: number
    fromChannelRoleInfo: RoleInfo
    fromGuildRoleInfo: RoleInfo
    levelRoleInfo: RoleInfo
    recallTime: string
    isOnlineMsg: boolean
    generalFlags: string
    clientSeq: string
    nameType: number
    avatarFlag: number

    senderUin: string
    peerUin: string
}

export interface Element {
    elementType: number
    elementId: string
    extBufForUI: string
    picElement?: PicElement
    textElement?: TextElement
    arkElement?: unknown
    avRecordElement?: unknown
    calendarElement?: unknown
    faceElement?: FaceElement
    fileElement?: FileElement
    giphyElement?: unknown
    grayTipElement?: GrayTipElement
    inlineKeyboardElement?: unknown
    liveGiftElement?: unknown
    markdownElement?: unknown
    marketFaceElement?: unknown
    multiForwardMsgElement?: unknown
    pttElement?: PttElement
    replyElement?: unknown
    structLongMsgElement?: unknown
    textGiftElement?: unknown
    videoElement?: VideoElement
    walletElement?: unknown
    yoloGameResultElement?: unknown
}

export interface PicElement {
    picSubType: number
    fileName: string
    fileSize: string
    picWidth: number
    picHeight: number
    original: boolean
    md5HexStr: string
    sourcePath: string
    thumbPath: ThumbPath
    transferStatus: number
    progress: number
    picType: number
    invalidState: number
    fileUuid: string
    fileSubId: string
    thumbFileSize: number
    summary: string
    emojiAd: EmojiAd
    emojiMall: EmojiMall
    emojiZplan: EmojiZplan
    originImageUrl?: string
}

export interface FaceElement {
    faceIndex: number
    faceText?: unknown
    faceType: 1 | 2 | 3 | 5
    packId?: string
    stickerId?: string
    sourceType?: unknown
    stickerType?: number
    resultId?: unknown
    surpriseId?: unknown
    randomType?: unknown
    imageType?: unknown
    pokeType?: unknown
    spokeSummary?: unknown
    doubleHit?: unknown
    vaspokeId?: unknown
    vaspokeName?: unknown
    vaspokeMinver?: unknown
    pokeStrength?: unknown
    msgType?: unknown
    faceBubbleCount?: unknown
    pokeFlag?: unknown
}

export interface FileElement {
    fileMd5: string
    fileName: string
    filePath: string
    fileSize: string
    picHeight: number
    picWidth: number
    picThumbPath: Record<string, unknown>
    expireTime: string
    file10MMd5: string
    fileSha: string
    fileSha3: string
    videoDuration: number
    transferStatus: number
    progress: number
    invalidState: number
    fileUuid: string
    fileSubId: string
    thumbFileSize: number
    fileBizId: unknown
    thumbMd5: unknown
    folderId: unknown
    fileGroupIndex: number
    fileTransType: unknown
}

export interface GrayTipElement {
    subElementType?: unknown
    revokeElement?: unknown
    proclamationElement?: unknown
    emojiReplyElement?: unknown
    groupElement?: GroupElement
    buddyElement?: unknown
    feedMsgElement?: unknown
    essenceElement?: unknown
    groupNotifyElement?: unknown
    buddyNotifyElement?: unknown
    xmlElement?: XmlElement
    fileReceiptElement?: unknown
    localGrayTipElement?: unknown
    blockGrayTipElement?: unknown
    aioOpGrayTipElement?: unknown
    jsonGrayTipElement?: JsonGrayTipElement
}

export interface JsonGrayTipElement {
    busiId: string
    jsonStr: string
    isServer: boolean
}

export interface PttElement {
    fileName: string
    filePath: string
    md5HexStr: string
    fileSize: string
    duration: number
    formatType: number
    voiceType: number
    voiceChangeType: number
    canConvert2Text: boolean
    fileId: number
    fileUuid: string
    text: string
    translateStatus: number
    transferStatus: number
    progress: number
    playState: number
    waveAmplitudes: number[]
    invalidState: number
    fileSubId: string
    fileBizId: unknown
}

export interface VideoElement {
    filePath: string
    fileName: string
    videoMd5: string
    thumbMd5: string
    fileTime: number
    thumbSize: number
    fileFormat: number
    fileSize: string
    thumbWidth: number
    thumbHeight: number
    busiType: number
    subBusiType: number
    thumbPath: Record<string, unknown>
    transferStatus: number
    progress: number
    invalidState: number
    fileUuid: string
    fileSubId: string
    fileBizId: unknown
}

export interface GroupElement {
    type: number
    role: number
    groupName?: string
    memberUid?: string
    memberNick?: string
    memberRemark?: string
    adminUid?: string
    adminNick?: string
    adminRemark?: string
    createGroup?: unknown
    memberAdd?: {
        showType: number
        otherAdd?: OtherAdd
        otherAddByOtherQRCode?: unknown
        otherAddByYourQRCode?: unknown
        youAddByOtherQRCode?: unknown
        otherInviteOther?: unknown
        otherInviteYou?: unknown
        youInviteOther?: unknown
    }
    shutUp?: {
        curTime: string
        duration: string
        admin: {
            uid: string
            card: string
            name: string
            role: number
            uin: string
        }
        member: {
            uid: string
            card: string
            name: string
            role: number
            uin: string
        }
    }
    memberUin?: string
    adminUin?: string
}

export interface OtherAdd {
    uid?: string
    name?: string
    uin?: string
}

export interface XmlElement {
    busiType?: string
    busiId?: string
    c2cType: number
    serviceType: number
    ctrlFlag: number
    content?: string
    templId?: string
    seqId?: string
    templParam?: unknown
    pbReserv?: string
    members?: unknown
}

export interface EmojiAd {
    url: string
    desc: string
}

export interface EmojiMall {
    packageId: number
    emojiId: number
}

export interface EmojiZplan {
    actionId: number
    actionName: string
    actionType: number
    playerNumber: number
    peerUid: string
    bytesReserveInfo: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ThumbPath { }

export interface TextElement {
    content: string
    atType: number
    atUid: string
    atTinyId: string
    atNtUid: string
    atNtUin: string
    subElementType: number
    atChannelId: string
    atRoleId: string
    atRoleColor: number
    atRoleName: string
    needNotify: number
}

export interface RoleInfo {
    roleId: string
    name: string
    color: number
}

export interface Media {
    msgId: string
    chatType: number
    peerUid: string
    elementId: string
    thumbSize: number
    downloadType: number
}

export interface GroupGetMemeberListPayload {
    group: number
    size: number
}

export interface GroupMuteMemberPayload {
    group: string
    memList: {
        uin: string
        timeStamp: number
    }[]
}

export interface GroupMuteEveryonePayload {
    group: string
    enable: boolean
}

export interface GroupKickPayload {
    uidList: string[]
    group: string
    refuseForever: boolean
    reason: string
}

export interface GroupGetAnnouncementsPayload {
    group: string
}

export interface MessageRecallPayload {
    msgIds: string[]
    peer: Peer
}

export interface MessageGetHistoryPayload {
    peer: Peer
    count: number
    offsetMsgId?: string
}

export interface MessageFetchRichMediaPayload {
    msgId: string,
    chatType: number,
    peerUid: string,
    elementId: string
}