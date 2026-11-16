import type { Command } from "commander"
import { createContext, publicClient } from "../lib/context.js"
import type { CommonOptions } from "../lib/env.js"
import { UsageError } from "../lib/errors.js"
import { printCatalogList, printJson, printModel, printModelList } from "../lib/output.js"
import { parseSearchKeywords } from "../lib/search.js"
import type { CatalogListResult, ModelDetail, ModelListResult } from "../lib/types.js"
import { addCommonOptions } from "./options.js"

type ListOptions = CommonOptions & {
  search?: string[]
  catalog?: string[]
  page?: string
  pageSize?: string
}

type GetOptions = CommonOptions

export function registerModelCommand(program: Command): void {
  const model = program
    .command("model")
    .description("Discover atomic generation models and inspect their input/output schemas")
    .addHelpText(
      "after",
      `
Models are single-call generation APIs. Use "model list" to discover available models,
then "model get <id>" to view the input/output JSON schema, examples and pricing.
Submit a generation with "task create <model-id> --input '<json>'".
`,
    )

  registerList(model)
  registerGet(model)
  registerCatalog(model)
}

function registerList(model: Command): void {
  const collect = (value: string, previous: string[] | undefined): string[] => [...(previous ?? []), value]

  const command = addCommonOptions(
    model
      .command("list")
      .description("List callable models with optional search, catalog filter and pagination")
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
    const result = await publicClient(context).get<ModelListResult>("/openapi/models", {
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
    printModelList(result)
  })
}

function registerGet(model: Command): void {
  const command = addCommonOptions(
    model
      .command("get")
      .description("Show a model's input/output schemas, examples, pricing and a ready-to-run task command")
      .argument("<model-id>", "model id"),
  )

  command.action(async (modelId: string, options: GetOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as GetOptions
    if (!modelId) {
      throw new UsageError("Missing required argument <model-id>.")
    }
    const context = await createContext(merged)
    const result = await publicClient(context).get<ModelDetail>(`/openapi/models/${encodeURIComponent(modelId)}`)

    if (merged.json) {
      printJson(result)
      return
    }
    printModel(result)
  })
}

function registerCatalog(model: Command): void {
  const catalog = model.command("catalog").description("Inspect shared model/workflow catalogs")
  const command = addCommonOptions(
    catalog.command("list").description("List supported catalogs (for example image or sprites)"),
  )

  command.action(async (_options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await publicClient(context).get<CatalogListResult>("/openapi/catalogs")

    if (merged.json) {
      printJson(result)
      return
    }
    printCatalogList(result.list)
  })
}
