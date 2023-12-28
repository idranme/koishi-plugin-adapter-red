import { RedBot } from './bot'
import * as Red from './types'

export default RedBot

type ParamCase<S extends string> =
    | S extends `${infer L}${infer R}`
    ? `${L extends '_' ? '-' : Lowercase<L>}${ParamCase<R>}`
    : S

// todo: 4.16.3 added parameter
type RedEvents = {
    [T in keyof Red.GatewayEvents as `red/${ParamCase<T>}`]: (input: Red.GatewayEvents[T]) => void
}

declare module '@satorijs/core' {
    interface Events extends RedEvents { }
}
