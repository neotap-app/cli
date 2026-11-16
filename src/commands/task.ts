import { readFile } from "node:fs/promises"
import type { Command } from "commander"
import { apiClient, createContext } from "../lib/context.js"
import type { CommonOptions } from "../lib/env.js"
import { UsageError } from "../lib/errors.js"
import { printJson, printTask, printTaskTable } from "../lib/output.js"
import type { CreateTaskResult, TaskDetail, TaskListResult } from "../lib/types.js"
import { addCommonOptions } from "./options.js"

type CreateOptions = CommonOptions & {
  kind?: string
  input?: string
  inputFile?: string
  studioProjectId?: string
}

type ListOptions = CommonOptions & {
  target?: string
  kind?: string
  status?: string[]
  apikeyId?: string
  studioProjectId?: string
  createdAfter?: string
  createdBefore?: string
  cursor?: string
  pageSize?: string
}

type GetOptions = CommonOptions

export function registerTaskCommand(program: Command): void {
  const task = program
    .command("task")
    .description("Submit and track asynchronous generation tasks for models or workflows")
    .addHelpText(
      "after",
      `
Tasks run asynchronously against a model or workflow. Pass the target input with
--input '<json>' or --input-file <path>. When --kind is omitted, the target is
resolved as a model first, then as a workflow.
Poll a task with "task get <task-id>", or filter with "task list --target <id>".

Statuses: pending, running, succeeded, failed, canceled.
`,
    )

  registerCreate(task)
  registerList(task)
  registerGet(task)
}

function registerCreate(task: Command): void {
  const command = addCommonOptions(
    task
      .command("create")
      .description("Submit a task to a model or workflow; input comes from --input or --input-file")
      .argument("<target-id>", "model or workflow id, e.g. batch-generate-sprite-images")
      .option("--kind <kind>", "target kind: model or workflow (auto-detected when omitted)")
      .option("--input <json>", "target input as a JSON string")
      .option("--input-file <path>", "read target input JSON from a file")
      .option("--studio-project-id <id>", "optional studio project id for billing/audit"),
  )

  command.action(async (targetId: string, options: CreateOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CreateOptions
    if (!targetId) {
      throw new UsageError("Missing required argument <target-id>.")
    }
    const targetKind = parseTargetKind(merged.kind)
    if ((merged.input && merged.inputFile) || (!merged.input && !merged.inputFile)) {
      throw new UsageError("Provide exactly one of --input <json> or --input-file <path>.")
    }

    const input = merged.inputFile
      ? parseJson(await readFile(merged.inputFile, "utf8"), merged.inputFile)
      : parseJson(merged.input!, "--input")

    const context = await createContext(merged)
    const result = await apiClient(context).post<CreateTaskResult>("/openapi/tasks", {
      body: {
        targetId,
        ...(targetKind ? { targetKind } : {}),
        input,
        ...(merged.studioProjectId ? { studioProjectId: merged.studioProjectId } : {}),
      },
    })

    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Created ${result.targetKind} task ${result.id} for ${result.targetId} (${result.status}).`)
    console.log(`Poll status: neotap task get ${result.id}`)
  })
}

function registerList(task: Command): void {
  const collect = (value: string, previous: string[]): string[] => [...previous, value]

  const command = addCommonOptions(
    task
      .command("list")
      .description("List your tasks with target, status and time filters (cursor pagination)")
      .option("--target <target-id>", "filter by model or workflow id")
      .option("--kind <kind>", "filter by target kind: model or workflow")
      .option("--status <status>", "filter by status (repeatable or comma-separated)", collect, [])
      .option("--apikey-id <id>", "filter by API key id")
      .option("--studio-project-id <id>", "filter by studio project id")
      .option("--created-after <iso>", "only tasks created at or after this ISO 8601 time")
      .option("--created-before <iso>", "only tasks created before this ISO 8601 time")
      .option("--cursor <cursor>", "pagination cursor (last task id from the previous page)")
      .option("--page-size <number>", "page size, 1-20 (default 10)"),
  )

  command.action(async (options: ListOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as ListOptions
    const statuses = (merged.status ?? [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
    const targetKind = parseTargetKind(merged.kind)

    const context = await createContext(merged)
    const result = await apiClient(context).get<TaskListResult>("/openapi/tasks", {
      query: {
        targetId: merged.target,
        targetKind,
        status: statuses.length > 0 ? statuses : undefined,
        apiKeyId: merged.apikeyId,
        studioProjectId: merged.studioProjectId,
        createdAfter: merged.createdAfter,
        createdBefore: merged.createdBefore,
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
    task
      .command("get")
      .description("Show one task's latest status, error and output")
      .argument("<task-id>", "task id"),
  )

  command.action(async (taskId: string, options: GetOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as GetOptions
    if (!taskId) {
      throw new UsageError("Missing required argument <task-id>.")
    }
    const context = await createContext(merged)
    const result = await apiClient(context).get<TaskDetail>(`/openapi/tasks/${encodeURIComponent(taskId)}`)

    if (merged.json) {
      printJson(result)
      return
    }
    printTask(result)
  })
}

function parseTargetKind(value: string | undefined): "model" | "workflow" | undefined {
  if (!value) {
    return undefined
  }
  if (value !== "model" && value !== "workflow") {
    throw new UsageError(`Invalid --kind value: ${value}. Expected model or workflow.`)
  }
  return value
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UsageError(`Invalid JSON from ${source}: ${message}`)
  }
}
