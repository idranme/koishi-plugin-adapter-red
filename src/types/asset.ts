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

declare module './internal' {
    interface Internal {
        uploadFile(data: FormData): Promise<File>
    }
}

Internal.define('/upload', { POST: 'uploadFile' })