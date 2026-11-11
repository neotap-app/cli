import { readFile } from "node:fs/promises"
import type { Command } from "commander"
import { normalizeArgv } from "../lib/argv.js"
import { apiClient, createContext, publicClient } from "../lib/context.js"
import { UsageError } from "../lib/errors.js"
import { printJson, printTask, printTaskDoc, printTaskDocList, printTaskTable } from "../lib/output.js"
import type { CommonOptions } from "../lib/env.js"
import type {
  OpenapiDocs,
  OpenapiTaskDoc,
  SubmitTaskResult,
  TaskDetail,
  TaskListResult,
} from "../lib/types.js"
import { addCommonOptions } from "./options.js"

type TaskOptions = CommonOptions & {
  type?: string
}

type SubmitOptions = CommonOptions & {
  type?: string
  input?: string
  inputFile?: string
  studioProjectId?: string
}

type ListOptions = CommonOptions & {
  type?: string
  status?: string[]
  apikeyId?: string
  cursor?: string
  pageSize?: string
}

type GetOptions = CommonOptions & {
  id?: string
}

export function registerTaskCommand(program: Command): void {
  const task = addCommonOptions(
    program
      .command("task")
      .description("Inspect and run NeoTap OpenAPI tasks")
      .option("--type <type>", "show the input schema for a task type"),
  )

  task.action(async (options: TaskOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as TaskOptions
    const context = await createContext(merged)
    const client = publicClient(context)

    if (merged.type) {
      const doc = await client.get<OpenapiTaskDoc>(`/openapi/docs/${encodeURIComponent(merged.type)}`)
      printTaskDoc(doc)
      return
    }

    console.log(cmd.helpInformation())
    try {
      const docs = await client.get<OpenapiDocs>("/openapi/docs")
      printTaskDocList(docs.tasks)
    } catch {
      console.log("Run 'neotap task --type <type> --help' to view task input schemas once the API is reachable.")
    }
  })

  registerSubmit(task)
  registerList(task)
  registerGet(task)
}

function registerSubmit(task: Command): void {
  const command = addCommonOptions(
    task
      .command("submit")
      .description("Submit a new OpenAPI task")
      .option("--type <type>", "task type, e.g. sprites-1")
      .option("--input <json>", "task input as a JSON string")
      .option("--input-file <path>", "read task input JSON from a file")
      .option("--studio-project-id <id>", "optional studio project id for billing/audit"),
  )

  command.action(async (options: SubmitOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as SubmitOptions
    if (!merged.type) {
      throw new UsageError("Missing required option --type <type>.")
    }
    if ((merged.input && merged.inputFile) || (!merged.input && !merged.inputFile)) {
      throw new UsageError("Provide exactly one of --input <json> or --input-file <path>.")
    }

    const input = merged.inputFile
      ? parseJson(await readFile(merged.inputFile, "utf8"), merged.inputFile)
      : parseJson(merged.input!, "--input")

    const context = await createContext(merged)
    const result = await apiClient(context).post<SubmitTaskResult>("/openapi/tasks", {
      body: {
        type: merged.type,
        input,
        ...(merged.studioProjectId ? { studioProjectId: merged.studioProjectId } : {}),
      },
    })

    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Submitted task ${result.id} (${result.status}).`)
    console.log(`Poll status: neotap task get --id ${result.id}`)
  })
}

function registerList(task: Command): void {
  const collect = (value: string, previous: string[]): string[] => [...previous, value]

  const command = addCommonOptions(
    task
      .command("list")
      .description("List OpenAPI tasks")
      .option("--type <type>", "filter by task type")
      .option("--status <status>", "filter by status (repeatable or comma-separated)", collect, [])
      .option("--apikey-id <id>", "filter by API key id")
      .option("--cursor <cursor>", "pagination cursor (last task id from the previous page)")
      .option("--page-size <number>", "page size, 1-20 (default 10)"),
  )

  command.action(async (options: ListOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as ListOptions
    const statuses = (merged.status ?? [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)

    const context = await createContext(merged)
    const result = await apiClient(context).get<TaskListResult>("/openapi/tasks", {
      query: {
        type: merged.type,
        status: statuses.length > 0 ? statuses : undefined,
        apiKeyId: merged.apikeyId,
        cursor: merged.cursor,
        pageSize: merged.pageSize,
      },
    })

    if (merged.json) {
      printJson(result)
      return
    }

    printTaskTable(result.list)
    if (result.nextCursor) {
      console.log(`\nNext page: neotap task list --cursor ${result.nextCursor}`)
    }
  })
}

function registerGet(task: Command): void {
  const command = addCommonOptions(
    task.command("get").description("Get a single OpenAPI task by id").option("--id <id>", "task id"),
  )

  command.action(async (options: GetOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as GetOptions
    if (!merged.id) {
      throw new UsageError("Missing required option --id <id>.")
    }
    const context = await createContext(merged)
    const result = await apiClient(context).get<TaskDetail>(`/openapi/tasks/${encodeURIComponent(merged.id)}`)

    if (merged.json) {
      printJson(result)
      return
    }
    printTask(result)
  })
}

const TASK_ACTIONS = new Set(["submit", "list", "get"])

// 在 commander 解析前拦截 `task --type <type> --help`，展示该类型的入参 schema。
// `task submit --help` 等子命令帮助仍交给 commander 处理。
export async function tryPrintTaskTypeHelp(argv: string[]): Promise<boolean> {
  const normalized = normalizeArgv(argv)
  const taskIndex = normalized.indexOf("task")
  if (taskIndex === -1) {
    return false
  }

  const tokens = normalized.slice(taskIndex + 1)
  const hasHelp = tokens.includes("--help") || tokens.includes("-h")
  const type = findOptionValue(tokens, "--type")
  if (!hasHelp || !type) {
    return false
  }

  const actionIndex = tokens.findIndex((token) => TASK_ACTIONS.has(token))
  if (actionIndex !== -1 && actionIndex < tokens.indexOf("--type")) {
    return false
  }

  const context = await createContext({
    apiUrl: findOptionValue(normalized, "--api-url"),
    webUrl: findOptionValue(normalized, "--web-url"),
    sandbox: normalized.includes("--sandbox"),
  })
  const doc = await publicClient(context).get<OpenapiTaskDoc>(`/openapi/docs/${encodeURIComponent(type)}`)
  printTaskDoc(doc)
  return true
}

function findOptionValue(argv: string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === flag) {
      return argv[index + 1]
    }
    if (value.startsWith(`${flag}=`)) {
      return value.slice(flag.length + 1)
    }
  }
  return undefined
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UsageError(`Invalid JSON from ${source}: ${message}`)
  }
}
