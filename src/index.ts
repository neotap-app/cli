#!/usr/bin/env node

import { Command, CommanderError } from "commander"
import { registerAuthCommand } from "./commands/auth.js"
import { registerTaskCommand, tryPrintTaskTypeHelp } from "./commands/task.js"
import { normalizeArgv } from "./lib/argv.js"
import { CliError } from "./lib/errors.js"
import { VERSION } from "./lib/version.js"

const program = new Command()
  .name("neotap")
  .description("NeoTap CLI: CLI tool for NeoTap Creators - Images, videos, audio , 3D assets AI Generator and library. Find trends, create and publish creative contents")
  .version(VERSION)
  .option("--api-url <url>", "NeoTap API base URL (default: https://api.neotap.app)")
  .option("--web-url <url>", "NeoTap web base URL (default: https://neotap.app)")
  .option("--json", "print machine-readable JSON output")
  .option("--sandbox", "Studio sandbox mode: do not send Authorization headers")
  .showHelpAfterError()
  .exitOverride()

registerAuthCommand(program)
registerTaskCommand(program)

async function main(): Promise<void> {
  try {
    if (await tryPrintTaskTypeHelp(process.argv.slice(2))) {
      return
    }
    await program.parseAsync(normalizeArgv(process.argv))
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help / --version 以 0 退出；其余解析错误保留 commander 的退出码。
      process.exitCode = error.exitCode
      return
    }
    if (error instanceof CliError) {
      console.error(`Error: ${error.message}`)
      process.exitCode = 1
      return
    }
    console.error(error instanceof Error ? `Error: ${error.message}` : error)
    process.exitCode = 1
  }
}

void main()
