export const enum ChatType {
    GROUP = 2,
    Direct = 1
}

export interface Peer {
    chatType: ChatType;
    peerUid?: string;
    guildId: null; // 一直为 Null
    peerUin?: string;
}