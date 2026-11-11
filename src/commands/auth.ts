import os from "node:os"
import type { Command } from "commander"
import { clearApiKey, configPath, saveApiKey } from "../lib/config.js"
import { apiClient, createContext, publicClient } from "../lib/context.js"
import { persistEndpoints, type CommonOptions } from "../lib/env.js"
import { CliError, UsageError } from "../lib/errors.js"
import { tryOpenBrowser } from "../lib/browser.js"
import { printJson } from "../lib/output.js"
import type { AuthMe, CliAuthPollResult, CliAuthStartResult } from "../lib/types.js"
import { addCommonOptions } from "./options.js"

type AuthOptions = CommonOptions & {
  apikey?: string
  logout?: boolean
}

export function registerAuthCommand(program: Command): void {
  const command = addCommonOptions(
    program
      .command("auth [action]")
      .description("Authorize this CLI via browser or API key (use 'auth logout' to sign out)")
      .option("--apikey <key>", "save and validate an OpenAPI API key instead of browser login")
      .option("--logout", "remove the saved API key from this machine"),
  )

  command.action(async (action: string | undefined, options: AuthOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as AuthOptions
    const context = await createContext(merged)

    if (action === "logout" || merged.logout) {
      await clearApiKey()
      console.log("NeoTap CLI credentials removed.")
      console.log(`Config: ${configPath}`)
      return
    }

    if (merged.apikey) {
      await loginWithApiKey(merged.apikey, merged, context.sandbox)
      return
    }

    if (context.sandbox) {
      console.log("Studio sandbox mode is active (NEOTAP_CLI_SANDBOX_MODE).")
      console.log("No CLI login is required: Studio injects the API key header automatically.")
      return
    }

    await loginWithBrowser(merged)
  })
}

async function loginWithApiKey(apiKey: string, options: AuthOptions, sandbox: boolean): Promise<void> {
  const key = apiKey.trim()
  if (!key) {
    throw new UsageError("API key must not be empty.")
  }

  if (!sandbox) {
    const context = await createContext({ ...options, apikey: key })
    const me = await apiClient(context).get<AuthMe>("/openapi/auth/me")
    await saveApiKey(key, persistEndpoints(options))
    console.log(`Authenticated as API key ${me.key?.name || me.keyId} (${me.type}).`)
    console.log(`Config: ${configPath}`)
    return
  }

  await saveApiKey(key, persistEndpoints(options))
  console.log("API key saved locally. Studio sandbox mode will still omit the Authorization header.")
  console.log(`Config: ${configPath}`)
}

async function loginWithBrowser(options: AuthOptions): Promise<void> {
  const context = await createContext(options)
  const client = publicClient(context)

  const start = await client.post<CliAuthStartResult>("/openapi/auth/cli/start", {
    body: { clientName: os.hostname() },
  })

  console.log("Authorize NeoTap CLI in your browser:")
  console.log(`  ${start.verificationUrl}`)
  console.log(`\nAuthorization code: ${start.userCode}`)
  console.log(`Waiting for approval (expires in ${Math.round(start.expiresIn / 60)} minutes)...`)

  tryOpenBrowser(start.verificationUrl)

  const deadline = Date.now() + start.expiresIn * 1000
  let intervalSeconds = start.interval || 3

  while (Date.now() < deadline) {
    await sleep(intervalSeconds * 1000)
    const result = await client.post<CliAuthPollResult>("/openapi/auth/cli/poll", {
      body: { deviceCode: start.deviceCode },
    })

    switch (result.status) {
      case "pending":
        intervalSeconds = result.interval || intervalSeconds
        break
      case "approved": {
        await saveApiKey(result.apiKey, persistEndpoints(options))
        if (options.json) {
          printJson({ authenticated: true, apiKeyId: result.apiKeyId, keyName: result.keyName })
        } else {
          console.log(`\nAuthorization approved. API key "${result.keyName}" saved.`)
          console.log(`Config: ${configPath}`)
        }
        return
      }
      case "denied":
        throw new CliError("Authorization was denied in the browser.", { code: "CliAuthDenied" })
      case "consumed":
        throw new CliError("This authorization request was already used. Run `neotap auth` again.", {
          code: "CliAuthConsumed",
        })
      case "expired":
        throw new CliError("Authorization request expired. Run `neotap auth` again.", {
          code: "CliAuthExpired",
        })
    }
  }

  throw new CliError("Authorization request timed out. Run `neotap auth` again.", { code: "CliAuthTimeout" })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
