import type {
  ModelDetail,
  ModelListResult,
  OpenapiCatalog,
  OpenapiTargetDetail,
  OpenapiTargetListResult,
  TaskDetail,
  WorkflowListResult,
} from "./types.js"

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

export function printTask(task: TaskDetail): void {
  const rows: Array<[string, string]> = [
    ["ID", task.id],
    ["Kind", task.targetKind],
    ["Target", task.targetId],
    ["Status", task.status],
    ["Created", formatDate(task.createdAt)],
    ["Updated", formatDate(task.updatedAt)],
    ["Finished", formatDate(task.finishedAt)],
  ]
  if (task.error) {
    rows.push(["Error", task.error])
  }

  const width = Math.max(...rows.map(([key]) => key.length))
  for (const [key, value] of rows) {
    console.log(`${key.padEnd(width)}  ${value}`)
  }
  if (task.output !== undefined) {
    console.log("\nOutput:")
    printJson(task.output)
  }
}

export function printTaskTable(tasks: TaskDetail[]): void {
  if (tasks.length === 0) {
    console.log("No tasks found.")
    return
  }

  const columns = ["ID", "KIND", "TARGET", "STATUS", "CREATED", "UPDATED"] as const
  const rows = tasks.map((task) => [
    task.id,
    task.targetKind,
    task.targetId,
    task.status,
    formatDate(task.createdAt),
    formatDate(task.updatedAt),
  ])
  printTable(columns, rows)
}

export function printModelList(result: ModelListResult): void {
  printTargetList(result, "model")
}

export function printWorkflowList(result: WorkflowListResult): void {
  printTargetList(result, "workflow")
}

function printTargetList(result: OpenapiTargetListResult, kind: "model" | "workflow"): void {
  if (result.list.length === 0) {
    console.log(`No ${kind}s found.`)
    return
  }

  const columns = ["ID", "NAME", "CATALOGS", "PROVIDER", "PRICE"] as const
  const rows = result.list.map((target) => [
    target.id,
    target.name,
    formatCatalogs(target.catalogs),
    target.providerName || "-",
    target.priceDescription,
  ])
  printTable(columns, rows)
  console.log(`\nPage ${result.page}, ${result.total} ${kind}(s) total, page size ${result.pageSize}.`)
}

export function printModel(model: ModelDetail): void {
  printTarget(model)
}

export function printWorkflow(workflow: OpenapiTargetDetail): void {
  printTarget(workflow)
}

function printTarget(model: OpenapiTargetDetail): void {
  console.log(`${model.id} - ${model.name}`)
  if (model.description) {
    console.log(model.description)
  }
  console.log(`\nCatalogs: ${formatCatalogs(model.catalogs) || "-"}`)
  console.log(`Provider: ${model.providerName || "-"}`)
  console.log(`Price: ${model.priceDescription}`)

  console.log("\nInput schema:")
  console.log(JSON.stringify(model.inputSchema, null, 2))
  if (model.inputExample !== undefined) {
    console.log("\nExample input:")
    console.log(JSON.stringify(model.inputExample, null, 2))
  }

  console.log("\nOutput schema:")
  console.log(JSON.stringify(model.outputSchema, null, 2))
  if (model.outputExample !== undefined) {
    console.log("\nExample output:")
    console.log(JSON.stringify(model.outputExample, null, 2))
  }

  const example = JSON.stringify(model.inputExample ?? {})
  console.log("\nCreate task:")
  console.log(`  neotap task create ${model.id} --input '${example}'`)
}

export function printCatalogList(catalogs: OpenapiCatalog[]): void {
  if (catalogs.length === 0) {
    console.log("No catalogs found.")
    return
  }
  const width = Math.max(...catalogs.map((catalog) => catalog.id.length))
  for (const catalog of catalogs) {
    console.log(`${catalog.id.padEnd(width)}  ${catalog.name}`)
  }
}

function formatCatalogs(catalogs: OpenapiCatalog[]): string {
  return catalogs.map((catalog) => catalog.name || catalog.id).join(", ")
}

function printTable(columns: readonly string[], rows: string[][]): void {
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => row[index]?.length ?? 0)),
  )

  const render = (values: readonly string[]) =>
    values.map((value, index) => value.padEnd(widths[index])).join("  ")

  console.log(render(columns))
  console.log(render(widths.map((width) => "-".repeat(width))))
  for (const row of rows) {
    console.log(render(row))
  }
}

export function formatDate(value: string | Date | undefined): string {
  if (!value) {
    return "-"
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }
  const pad = (part: number) => String(part).padStart(2, "0")
  // 使用运行机器的本地时区展示，避免用户看到 UTC 时间。
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(" ")
}
