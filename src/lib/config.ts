import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import envPaths from "env-paths"

export type CliConfig = {
  apiKey?: string
  apiUrl?: string
  webUrl?: string
  lastAuthAt?: string
}

const paths = envPaths("neotap-cli", { suffix: "" })

export const configPath = join(paths.config, "config.json")

export async function readConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(configPath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    return parsed as CliConfig
  } catch {
    return {}
  }
}

export async function writeConfig(config: CliConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
  try {
    await chmod(configPath, 0o600)
  } catch {
    // Windows 不支持 POSIX 权限，忽略即可。
  }
}

export async function saveApiKey(apiKey: string, extra: Partial<CliConfig> = {}): Promise<void> {
  const current = await readConfig()
  await writeConfig({
    ...current,
    ...extra,
    apiKey,
    lastAuthAt: new Date().toISOString(),
  })
}

export async function clearApiKey(): Promise<void> {
  const current = await readConfig()
  delete current.apiKey
  delete current.lastAuthAt
  await writeConfig(current)
}
