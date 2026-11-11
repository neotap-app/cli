import { CliError } from "./errors.js"
import { VERSION } from "./version.js"

export type QueryValue = string | number | null | undefined

export type RequestOptions = {
  query?: Record<string, QueryValue | QueryValue[]>
  body?: unknown
  timeoutMs?: number
}

type ApiEnvelope = {
  success?: boolean
  code?: string
  message?: string
  data?: unknown
}

export type ApiClientOptions = {
  baseUrl: string
  apiKey?: string
  sandbox?: boolean
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly sandbox: boolean

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey
    this.sandbox = Boolean(options.sandbox)
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, options)
  }

  post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, options)
  }

  private async request<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, `${this.baseUrl}/`)
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        const values = Array.isArray(value) ? value : [value]
        for (const item of values) {
          if (item !== undefined && item !== null && item !== "") {
            url.searchParams.append(key, String(item))
          }
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": `neotap-cli/${VERSION}`,
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
    }
    // Sandbox 模式下由 Studio infra 注入鉴权头，CLI 不主动发送。
    if (this.apiKey && !this.sandbox) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      })
    } catch (error) {
      throw new CliError(`Failed to reach NeoTap API at ${this.baseUrl}: ${errorMessage(error)}`, {
        code: "NetworkError",
      })
    }

    const raw = await response.text()
    let payload: ApiEnvelope | undefined
    if (raw) {
      try {
        payload = JSON.parse(raw) as ApiEnvelope
      } catch {
        payload = undefined
      }
    }

    if (!response.ok || payload?.success !== true) {
      const message =
        payload?.message ||
        (raw ? truncate(raw, 500) : `Request failed with HTTP ${response.status} ${response.statusText}`)
      throw new CliError(message, { code: payload?.code, status: response.status })
    }

    return payload.data as T
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
