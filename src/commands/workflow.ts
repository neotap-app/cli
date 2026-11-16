import type { Command } from "commander"
import { createContext, publicClient } from "../lib/context.js"
import type { CommonOptions } from "../lib/env.js"
import { UsageError } from "../lib/errors.js"
import { printJson, printWorkflow, printWorkflowList } from "../lib/output.js"
import { parseSearchKeywords } from "../lib/search.js"
import type { WorkflowDetail, WorkflowListResult } from "../lib/types.js"
import { addCommonOptions } from "./options.js"

type ListOptions = CommonOptions & {
  search?: string[]
  catalog?: string[]
  page?: string
  pageSize?: string
}

type GetOptions = CommonOptions

export function registerWorkflowCommand(program: Command): void {
  const workflow = program
    .command("workflow")
    .description("Discover multi-step generation workflows and inspect their input/output schemas")
    .addHelpText(
      "after",
      `
Workflows are long-running generation tasks. Use "workflow list" to discover them,
then "workflow get <id>" to view the input/output JSON schema, examples and pricing.
Submit with "task create <workflow-id> --input '<json>'" and poll with "task get <task-id>".
`,
    )

  registerList(workflow)
  registerGet(workflow)
}

function registerList(workflow: Command): void {
  const collect = (value: string, previous: string[] | undefined): string[] => [...(previous ?? []), value]

  const command = addCommonOptions(
    workflow
      .command("list")
      .description("List callable workflows with optional search, catalog filter and pagination")
      .option(
        "--search <query>",
        "match id, name, description or catalog name (repeatable or comma-separated, max 8)",
        collect,
      )
      .option("--catalog <catalog>", "filter by catalog (repeatable or comma-separated)", collect)
      .option("--page <number>", "page number, starting at 1 (default 1)")
      .option("--page-size <number>", "page size, 1-100 (default 10)"),
  )

  command.action(async (options: ListOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as ListOptions
    const search = parseSearchKeywords(merged.search ?? [])
    const catalogs = (merged.catalog ?? [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)

    const context = await createContext(merged)
    const result = await publicClient(context).get<WorkflowListResult>("/openapi/workflows", {
      query: {
        search: search.length > 0 ? search : undefined,
        catalog: catalogs.length > 0 ? catalogs : undefined,
        page: merged.page,
        pageSize: merged.pageSize,
      },
    })

    if (merged.json) {
      printJson(result)
      return
    }
    printWorkflowList(result)
  })
}

function registerGet(workflow: Command): void {
  const command = addCommonOptions(
    workflow
      .command("get")
      .description("Show a workflow's input/output schemas, examples, pricing and a ready-to-run task command")
      .argument("<workflow-id>", "workflow id"),
  )

  command.action(async (workflowId: string, options: GetOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as GetOptions
    if (!workflowId) {
      throw new UsageError("Missing required argument <workflow-id>.")
    }
    const context = await createContext(merged)
    const result = await publicClient(context).get<WorkflowDetail>(
      `/openapi/workflows/${encodeURIComponent(workflowId)}`,
    )

    if (merged.json) {
      printJson(result)
      return
    }
    printWorkflow(result)
  })
}
