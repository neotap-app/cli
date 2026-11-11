import type { OpenapiTaskDoc, TaskDetail } from "./types.js"

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

export function printTask(task: TaskDetail): void {
  const rows: Array<[string, string]> = [
    ["ID", task.id],
    ["Type", task.type],
    ["Status", task.status],
    ["Created", formatDate(task.createdAt)],
    ["Updated", formatDate(task.updatedAt)],
    ["Finished", formatDate(task.finishedAt)],
    ["Studio project", task.studioProjectId ?? "-"],
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

  const columns = ["ID", "TYPE", "STATUS", "CREATED", "UPDATED"] as const
  const rows = tasks.map((task) => [
    task.id,
    task.type,
    task.status,
    formatDate(task.createdAt),
    formatDate(task.updatedAt),
  ])
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

export function printTaskDoc(doc: OpenapiTaskDoc): void {
  console.log(`${doc.type} - ${doc.title}`)
  if (doc.description) {
    console.log(doc.description)
  }
  console.log("\nInput schema:")
  console.log(JSON.stringify(doc.inputSchema, null, 2))

  if (doc.inputExample !== undefined) {
    console.log("\nExample input:")
    console.log(JSON.stringify(doc.inputExample, null, 2))
  }
  if (doc.outputDescription) {
    console.log("\nOutput:")
    console.log(doc.outputDescription)
  }
  console.log(`\nChargeable: ${doc.chargeable ? "yes" : "no"}`)

  const example = JSON.stringify(doc.inputExample ?? {})
  console.log("\nSubmit:")
  console.log(`  neotap task submit --type ${doc.type} --input '${example}'`)
}

export function printTaskDocList(docs: OpenapiTaskDoc[]): void {
  if (docs.length === 0) {
    console.log("No OpenAPI task types are currently available.")
    return
  }
  console.log("Available task types:")
  for (const doc of docs) {
    console.log(`  ${doc.type.padEnd(20)} ${doc.title}`)
  }
  console.log("\nRun 'neotap task --type <type> --help' for the input schema.")
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
