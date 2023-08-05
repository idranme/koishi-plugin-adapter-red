export const enum ChatType {
    GROUP = 2,
}

export interface Peer {
    chatType: ChatType;
    peerUid?: string;
    guildId: null; // 一直为 Null
}