import { RedBot } from './bot'
import * as Red from './types'

export default RedBot

type ParamCase<S extends string> = S extends `${infer L}${infer R}` ? `${L extends '_' ? '-' : Lowercase<L>}${ParamCase<R>}` : S

type RedEvents = {
    [T in keyof Red.GatewayEvents as `red/${ParamCase<T>}`]: (input: Red.GatewayEvents[T], bot: RedBot) => void
}

declare module 'koishi' {
    interface Events extends RedEvents { }
}