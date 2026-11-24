#!/usr/bin/env node

import { Command, CommanderError } from "commander"
import { registerAuthCommand } from "./commands/auth.js"
import { registerContentCommand } from "./commands/content.js"
import { registerInteractivePreviewCommand } from "./commands/interactive-preview.js"
import { registerModelCommand } from "./commands/model.js"
import { registerTaskCommand } from "./commands/task.js"
import { registerWorkflowCommand } from "./commands/workflow.js"
import { normalizeArgv } from "./lib/argv.js"
import { CliError } from "./lib/errors.js"
import { VERSION } from "./lib/version.js"

const program = new Command()
  .name("neotap")
  .description(
    "NeoTap CLI for creators: discover models/workflows, run AI generation tasks, and manage images, videos, audio and 3D assets.",
  )
  .version(VERSION)
  .option("--api-url <url>", "NeoTap API base URL (default: https://api.neotap.app)")
  .option("--web-url <url>", "NeoTap web base URL (default: https://neotap.app)")
  .option("--json", "print machine-readable JSON output")
  .option("--sandbox", "Studio sandbox mode: do not send Authorization headers")
  .addHelpText(
    "after",
    `
Model, workflow and task commands:
  model      Discover atomic generation models (list, get, catalog list).
  workflow   Discover multi-step generation workflows (list, get).
  task       Submit and track asynchronous generation tasks against a model or workflow.
  content    Create, upload and publish interactive or media content.
  interactive  Manage Studio interactive previews.

Examples:
  $ neotap model list --catalog image
  $ neotap model list --search image --search sprites
  $ neotap workflow get batch-generate-sprite-images
  $ neotap task create batch-generate-sprite-images --input '{"model":"gpt-image-2","sprites":[...]}'
  $ neotap task list --target batch-generate-sprite-images --status running
`,
  )
  .showHelpAfterError()
  .exitOverride()

registerAuthCommand(program)
registerContentCommand(program)
registerInteractivePreviewCommand(program)
registerModelCommand(program)
registerWorkflowCommand(program)
registerTaskCommand(program)

async function main(): Promise<void> {
  try {
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
