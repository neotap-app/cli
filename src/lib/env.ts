import type { CliConfig } from "./config.js"

export const DEFAULT_API_URL = "https://api.neotap.app"
export const DEFAULT_WEB_URL = "https://neotap.app"

export type CommonOptions = {
  apiUrl?: string
  webUrl?: string
  json?: boolean
  sandbox?: boolean
  apikey?: string
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  return ["1", "true", "yes", "on", "enabled"].includes(value.trim().toLowerCase())
}

// Sandbox 模式：NeoTap Studio 的 e2b 沙箱会拦截 HTTP(S) 请求并自动注入 API Key，
// CLI 只发不带 Authorization 的请求即可。
export function isSandboxMode(options: CommonOptions = {}): boolean {
  return Boolean(options.sandbox) || isTruthy(process.env.NEOTAP_CLI_SANDBOX_MODE)
}

export function resolveApiUrl(options: CommonOptions = {}, config: CliConfig = {}): string {
  return trimSlash(options.apiUrl || process.env.NEOTAP_API_URL || config.apiUrl || DEFAULT_API_URL)
}

export function resolveWebUrl(options: CommonOptions = {}, config: CliConfig = {}): string {
  return trimSlash(options.webUrl || process.env.NEOTAP_WEB_URL || config.webUrl || DEFAULT_WEB_URL)
}

export function resolveApiKey(options: CommonOptions = {}, config: CliConfig = {}): string | undefined {
  if (isSandboxMode(options)) {
    return undefined
  }
  return options.apikey || process.env.NEOTAP_APIKEY || config.apiKey || undefined
}

export function persistEndpoints(options: CommonOptions = {}): Partial<CliConfig> {
  return {
    ...(options.apiUrl ? { apiUrl: trimSlash(options.apiUrl) } : {}),
    ...(options.webUrl ? { webUrl: trimSlash(options.webUrl) } : {}),
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "")
}
