import { Internal, Peer } from '.'

export interface Message {
    msgId: string;
    msgRandom: string;
    msgSeq: string;
    cntSeq: string;
    chatType: number;
    msgType: number;
    subMsgType: number;
    sendType: number;
    senderUid: string;
    peerUid: string;
    channelId: string;
    guildId: string;
    guildCode: string;
    fromUid: string;
    fromAppid: string;
    msgTime: string;
    msgMeta: string;
    sendStatus: number;
    sendMemberName: string;
    sendNickName: string;
    guildName: string;
    channelName: string;
    elements: Element[];
    records: any[];
    emojiLikesList: any[];
    commentCnt: string;
    directMsgFlag: number;
    directMsgMembers: any[];
    peerName: string;
    editable: boolean;
    avatarMeta: string;
    avatarPendant: string;
    feedId: string;
    roleId: string;
    timeStamp: string;
    isImportMsg: boolean;
    atType: number;
    roleType: number;
    fromChannelRoleInfo: RoleInfo;
    fromGuildRoleInfo: RoleInfo;
    levelRoleInfo: RoleInfo;
    recallTime: string;
    isOnlineMsg: boolean;
    generalFlags: string;
    clientSeq: string;
    nameType: number;
    avatarFlag: number;
    peerUin: string;
    senderUin: string;
}

export interface Element {
    elementType: number;
    elementId: string;
    extBufForUI: string;
    picElement?: PicElement;
    textElement?: TextElement;
    // TODO: type these
    arkElement?: unknown;
    avRecordElement?: unknown;
    calendarElement?: unknown;
    faceElement?: unknown;
    fileElement?: unknown;
    giphyElement?: unknown;
    grayTipElement?: {
        xmlElement: XMLElement,
        aioOpGrayTipElement: unknown,
        blockGrayTipElement: unknown,
        buddyElement: unknown,
        buddyNotifyElement: unknown,
        emojiReplyElement: unknown,
        essenceElement: unknown,
        feedMsgElement: unknown,
        fileReceiptElement: unknown,
        groupElement: unknown,
        groupNotifyElement: unknown,
        jsonGrayTipElement: unknown,
        localGrayTipElement: unknown,
        proclamationElement: unknown,
        revokeElement: unknown,
        subElementType: unknown,
    };
    inlineKeyboardElement?: unknown;
    liveGiftElement?: unknown;
    markdownElement?: unknown;
    marketFaceElement?: unknown;
    multiForwardMsgElement?: unknown;
    pttElement?: unknown;
    replyElement?: unknown;
    structLongMsgElement?: unknown;
    textGiftElement?: unknown;
    videoElement?: unknown;
    walletElement?: unknown;
    yoloGameResultElement?: unknown;
}

export interface XMLElement {
    busiType: string;
    busiId: string;
    c2cType: number;
    serviceType: number;
    ctrlFlag: number;
    content: string;
    templId: string;
    seqId: string;
    templParam: any;
    pbReserv: string;
    members: any;
}

export interface PicElement {
    picSubType: number;
    fileName: string;
    fileSize: string;
    picWidth: number;
    picHeight: number;
    original: boolean;
    md5HexStr: string;
    sourcePath: string;
    thumbPath: ThumbPath;
    transferStatus: number;
    progress: number;
    picType: number;
    invalidState: number;
    fileUuid: string;
    fileSubId: string;
    thumbFileSize: number;
    summary: string;
    emojiAd: EmojiAd;
    emojiMall: EmojiMall;
    emojiZplan: EmojiZplan;
}

export interface EmojiAd {
    url: string;
    desc: string;
}

export interface EmojiMall {
    packageId: number;
    emojiId: number;
}

export interface EmojiZplan {
    actionId: number;
    actionName: string;
    actionType: number;
    playerNumber: number;
    peerUid: string;
    bytesReserveInfo: string;
}

export interface ThumbPath {
}

export interface TextElement {
    content: string;
    atType: number;
    atUid: string;
    atTinyId: string;
    atNtUid: string;
    subElementType: number;
    atChannelId: string;
    atRoleId: string;
    atRoleColor: number;
    atRoleName: string;
    needNotify: number;
    atNtUin: string;
}

export interface RoleInfo {
    roleId: string;
    name: string;
    color: number;
}

export interface Recall {
    msgIds: string[]
    peer: Peer
}

export interface GetHistory {
    peer: Peer,
    offsetMsgId?: string, // 偏移，从哪条开始
    count: number // 数量
}

export interface Send {
    peer: Peer
    elements: Element[]
}

declare module './internal' {
    interface Internal {
        recall(data: Recall): Promise<any>
        getHistory(data: GetHistory): Promise<any>
        send(data: Send): Promise<any>
    }
}

Internal.define('/message/recall', { POST: 'recall' })
Internal.define('/message/getHistory', { POST: 'getHistory' })
Internal.define('/message/send', { POST: 'send' })