import type { Command } from "commander"
import { createContext, publicClient } from "../lib/context.js"
import type { CommonOptions } from "../lib/env.js"
import { UsageError } from "../lib/errors.js"
import { printCatalogList, printJson, printModel, printModelList } from "../lib/output.js"
import type { CatalogListResult, ModelDetail, ModelListResult } from "../lib/types.js"
import { addCommonOptions } from "./options.js"

type ListOptions = CommonOptions & {
  search?: string
  catalog?: string[]
  page?: string
  pageSize?: string
}

type GetOptions = CommonOptions

export function registerModelCommand(program: Command): void {
  const model = program.command("model").description("Inspect NeoTap OpenAPI models")

  registerList(model)
  registerGet(model)
  registerCatalog(model)
}

function registerList(model: Command): void {
  const collect = (value: string, previous: string[]): string[] => [...previous, value]

  const command = addCommonOptions(
    model
      .command("list")
      .description("List callable OpenAPI models")
      .option("--search <query>", "match model id, name or description")
      .option("--catalog <catalog>", "filter by catalog (repeatable or comma-separated)", collect, [])
      .option("--page <number>", "page number, starting at 1 (default 1)")
      .option("--page-size <number>", "page size, 1-100 (default 10)"),
  )

  command.action(async (options: ListOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as ListOptions
    const catalogs = (merged.catalog ?? [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)

    const context = await createContext(merged)
    const result = await publicClient(context).get<ModelListResult>("/openapi/models", {
      query: {
        search: merged.search,
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
    model.command("get").description("Get a model's full input/output definition").argument("<model-id>", "model id"),
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
  const catalog = model.command("catalog").description("Inspect model catalogs")
  const command = addCommonOptions(catalog.command("list").description("List supported model catalogs"))

  command.action(async (_options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await publicClient(context).get<CatalogListResult>("/openapi/models/catalogs")

    if (merged.json) {
      printJson(result)
      return
    }
    printCatalogList(result.list)
  })
}
