import { readConfig, type CliConfig } from "./config.js"
import { isSandboxMode, resolveApiKey, resolveApiUrl, resolveWebUrl, type CommonOptions } from "./env.js"
import { UsageError } from "./errors.js"
import { ApiClient } from "./http.js"

export type CliContext = {
  config: CliConfig
  apiUrl: string
  webUrl: string
  sandbox: boolean
  apiKey?: string
}

export async function createContext(options: CommonOptions = {}): Promise<CliContext> {
  const config = await readConfig()
  return {
    config,
    apiUrl: resolveApiUrl(options, config),
    webUrl: resolveWebUrl(options, config),
    sandbox: isSandboxMode(options),
    apiKey: resolveApiKey(options, config),
  }
}

export function apiClient(context: CliContext, options: { requireAuth?: boolean } = {}): ApiClient {
  const requireAuth = options.requireAuth ?? true
  if (requireAuth && !context.sandbox && !context.apiKey) {
    throw new UsageError(
      "No API key found. Run `neotap auth` to authorize in the browser, or `neotap auth --apikey <key>`, or set NEOTAP_APIKEY.",
    )
  }
  return new ApiClient({
    baseUrl: context.apiUrl,
    apiKey: context.apiKey,
    sandbox: context.sandbox,
  })
}

export function publicClient(context: CliContext): ApiClient {
  return new ApiClient({ baseUrl: context.apiUrl, sandbox: true })
}
