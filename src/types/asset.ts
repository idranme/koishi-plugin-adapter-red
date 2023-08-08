import { Internal } from '.'
import FormData from 'form-data'

export interface File {
    md5: string
    imageInfo: {
        width: number
        height: number
        type: string
        mime: string
        wUnits: string
        hUnits: string
    }
    fileSize: number
    filePath: string
    ntFilePath: string
}

export interface fetchRichMedia {
    msgId: string, // 消息 ID
    chatType: number, // Peer 类型
    peerUin: string, // Peer ID
    elementId: string, // 富媒体消息元素 ID
    thumbSize: number, // 照传即可
    downloadType: number // 照传即可
}

declare module './internal' {
    interface Internal {
        uploadFile(data: FormData): Promise<File>
        fetchRichMedia(data: fetchRichMedia): Promise<unknown>
    }
}

Internal.define('/upload', { POST: 'uploadFile' })
Internal.define('/message/fetchRichMedia', { POST: 'fetchRichMedia' })