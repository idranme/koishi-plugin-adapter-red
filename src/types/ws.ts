import { AuthData, Message, Element, Peer } from "."

export interface ConnectSend {
    type: 'meta::connect'
    payload: {
        token: string
    }
}

export interface ConnectRecv {
    type: 'meta::connect'
    payload: {
        version: string,
        name: string,
        authData: AuthData
    }
}

export interface MessageRecv {
    type: 'message::recv'
    payload: Message[]
}

export interface MessageSend {
    type: 'message::send'
    payload: {
        peer: Peer
        elements: Element[]
    }
}

interface EventsMap {
    'ConnectSend': ConnectSend
    'ConnectRecv': ConnectRecv
    'MessageRecv': MessageRecv
    'MessageSend': MessageSend
}

export type WsEvents<K extends keyof EventsMap = keyof EventsMap> = EventsMap[K]