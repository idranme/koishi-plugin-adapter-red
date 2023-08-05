import { Quester, makeArray, Dict } from 'koishi'
import FormData from 'form-data'

export class Internal {
    _wsRequest?(type: string, payload: Dict): void
    constructor(private http: Quester) { }

    static define(path: string, methods: Partial<Record<Quester.Method, string | string[]>>) {
        for (const key in methods) {
            const method = key as Quester.Method
            for (const name of makeArray(methods[method])) {
                this.prototype[name] = async function (this: Internal, ...args: any[]) {
                    const url = path.replace(/\{([^}]+)\}/g, () => {
                        if (!args.length) throw new TypeError('missing arguments')
                        return args.shift()
                    })
                    const config: Quester.AxiosRequestConfig = {}
                    if (args.length === 1) {
                        if (method === 'GET' || method === 'DELETE') {
                            config.params = args[0]
                        } else {
                            if (method === 'POST' && args[0] instanceof FormData) {
                                config.headers = args[0].getHeaders()
                            }
                            config.data = args[0]
                        }
                    } else if (args.length === 2 && method !== 'GET' && method !== 'DELETE') {
                        config.data = args[0]
                        config.params = args[1]
                    } else if (args.length > 1) {
                        const raw = args.join(', ')
                        throw new Error(`too many arguments for ${path}, received ${raw}`)
                    }
                    return this.http(method, url, config)
                }
            }
        }
    }
}