import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { Command } from "commander"
import { apiClient, createContext, type CliContext } from "../lib/context.js"
import type { CommonOptions } from "../lib/env.js"
import { CliError, UsageError } from "../lib/errors.js"
import type { ApiClient } from "../lib/http.js"
import { printJson } from "../lib/output.js"
import { addCommonOptions } from "./options.js"

const MAX_FILE_COUNT = 1000
const MAX_TOTAL_SIZE = 32 * 1024 * 1024
const MAX_INDEX_SIZE = 1024 * 1024
const UPLOAD_CONCURRENCY = 8

type FileTuple = [path: string, sha256: string, size: number]

type PreviewUploadItem = {
  path: string
  sha256: string
  size: number
  blobKey: string
  uploadUrl: string
  requiredHeaders: Record<string, string>
  expiresAt: string
}

type StartUploadResult = {
  previewId: string
  unchanged: boolean
  uploads: PreviewUploadItem[]
  expiresAt: string | null
}

type CompleteUploadResult = {
  previewId: string
  status: string
  unchanged?: boolean
  workflowId: string | null
}

type PreviewStatusResult = {
  previewId: string
  projectId: string
  status: string
  fileCount: number
  totalSize: number
  error: string | null
  uploadStartedAt: string | null
  uploadExpiresAt: string | null
  deployStartedAt: string | null
  deployExpiresAt: string | null
  readyAt: string | null
  createdAt: string
  updatedAt: string
}

const TERMINAL_PREVIEW_STATUSES = new Set(["ready", "failed", "expired", "superseded"])

type ScannedFile = {
  tuple: FileTuple
  fullPath: string
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

function shouldSkipEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory && (name === "node_modules" || name === ".git")) {
    return true
  }
  return name.startsWith(".")
}

async function scanProject(projectDir: string): Promise<ScannedFile[]> {
  const root = path.resolve(projectDir)
  const rootStat = await stat(root).catch(() => undefined)
  if (!rootStat?.isDirectory()) {
    throw new UsageError(`Project directory not found: ${projectDir}`)
  }

  const files: ScannedFile[] = []
  let totalSize = 0

  async function walk(current: string, relative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (shouldSkipEntry(entry.name, entry.isDirectory())) continue
      const fullPath = path.join(current, entry.name)
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
        continue
      }
      if (!entry.isFile()) continue

      const info = await stat(fullPath)
      if (info.size <= 0) {
        throw new UsageError(`Empty files are not supported: ${relativePath}`)
      }
      totalSize += info.size
      if (files.length + 1 > MAX_FILE_COUNT) {
        throw new UsageError(`Project has more than ${MAX_FILE_COUNT} files.`)
      }
      if (totalSize > MAX_TOTAL_SIZE) {
        throw new UsageError("Project exceeds the 32MB preview limit.")
      }
      const sha256 = await hashFile(fullPath)
      files.push({
        tuple: [relativePath, sha256, info.size],
        fullPath,
      })
    }
  }

  await walk(root, "")
  files.sort((a, b) => a.tuple[0].localeCompare(b.tuple[0]))

  const index = files.find((item) => item.tuple[0] === "index.html")
  if (!index) {
    throw new UsageError("index.html must exist at the project root.")
  }
  if (index.tuple[2] >= MAX_INDEX_SIZE) {
    throw new UsageError("index.html must be smaller than 1MB.")
  }

  return files
}

async function putFile(item: PreviewUploadItem, fullPath: string): Promise<void> {
  const body = await readFile(fullPath)
  const response = await fetch(item.uploadUrl, {
    method: "PUT",
    headers: item.requiredHeaders,
    body,
  })
  if (!response.ok) {
    throw new CliError(
      `Blob upload failed: HTTP ${response.status} ${await response.text()}`,
      { code: "BlobUploadFailed", status: response.status },
    )
  }
}

async function uploadItems(
  items: PreviewUploadItem[],
  bySha: Map<string, ScannedFile>,
): Promise<void> {
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      const item = items[index]
      const local = bySha.get(item.sha256)
      if (!local) {
        throw new CliError(`Missing local file for ${item.path}`, {
          code: "LocalFileMissing",
        })
      }
      await putFile(item, local.fullPath)
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, items.length) },
      () => worker(),
    ),
  )
}

async function startUpload(
  client: ApiClient,
  previewId: string,
  uploadRequestId: string,
  files: ScannedFile[],
): Promise<StartUploadResult> {
  return await client.post<StartUploadResult>(
    "/openapi/interactive-preview/start-upload",
    {
      body: {
        previewId,
        uploadRequestId,
        files: files.map((file) => file.tuple),
      },
    },
  )
}

async function uploadPreview(
  client: ApiClient,
  previewId: string,
  files: ScannedFile[],
  json: boolean,
): Promise<{ start: StartUploadResult; complete: CompleteUploadResult }> {
  const bySha = new Map(files.map((file) => [file.tuple[1], file]))
  const uploadRequestId = randomUUID()

  let start = await startUpload(client, previewId, uploadRequestId, files)
  try {
    if (!json && start.uploads.length > 0) {
      process.stderr.write(`Uploading ${start.uploads.length} preview files...\n`)
    }
    await uploadItems(start.uploads, bySha)
  } catch (error) {
    if (!json) {
      process.stderr.write("Upload failed; refreshing URLs and retrying...\n")
    }
    start = await startUpload(client, previewId, uploadRequestId, files)
    await uploadItems(start.uploads, bySha)
  }

  let complete: CompleteUploadResult
  try {
    complete = await client.post<CompleteUploadResult>(
      "/openapi/interactive-preview/complete-upload",
      { body: { previewId } },
    )
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== "Preview.MissingBlobs") {
      throw error
    }
    if (!json) {
      process.stderr.write("Some blobs are missing; refreshing upload URLs...\n")
    }
    start = await startUpload(client, previewId, uploadRequestId, files)
    await uploadItems(start.uploads, bySha)
    complete = await client.post<CompleteUploadResult>(
      "/openapi/interactive-preview/complete-upload",
      { body: { previewId } },
    )
  }
  return { start, complete }
}

async function getPreviewStatus(client: ApiClient, previewId: string) {
  return await client.post<PreviewStatusResult>(
    "/openapi/interactive-preview/get-status",
    { body: { previewId } },
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPreviewStatus(
  client: ApiClient,
  previewId: string,
  json: boolean,
  timeoutMs = 10 * 60 * 1000,
): Promise<PreviewStatusResult | undefined> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await getPreviewStatus(client, previewId)
    if (TERMINAL_PREVIEW_STATUSES.has(status.status)) {
      return status
    }
    if (!json) {
      process.stderr.write(`\rPreview status: ${status.status}`)
    }
    await sleep(2000)
  }
  return undefined
}

function resolveProjectDir(context: CliContext, optionDir?: string): string {
  if (optionDir) return optionDir
  return context.sandbox ? path.join(os.homedir(), "project") : process.cwd()
}

function printPreviewStatus(result: PreviewStatusResult): void {
  console.log(`Preview: ${result.previewId}`)
  console.log(`Project: ${result.projectId}`)
  console.log(`Status: ${result.status}`)
  console.log(`Files: ${result.fileCount}`)
  console.log(`Size: ${result.totalSize} bytes`)
  if (result.error) console.log(`Error: ${result.error}`)
  console.log(`Upload expires: ${result.uploadExpiresAt ?? "-"}`)
  console.log(`Deploy expires: ${result.deployExpiresAt ?? "-"}`)
  console.log(`Ready at: ${result.readyAt ?? "-"}`)
  console.log(`Updated at: ${result.updatedAt}`)
}

export function registerInteractivePreviewCommand(program: Command): void {
  const interactive = program
    .command("interactive")
    .description("Manage Studio interactive content")

  const preview = interactive
    .command("preview")
    .description("Upload and inspect Studio interactive previews")

  addCommonOptions(
    preview
      .command("upload")
      .description("Scan a project directory, upload changed files and deploy a preview")
      .requiredOption("--preview-id <id>", "preview id created by Studio updatePreview")
      .option("--project-dir <path>", "project directory (default: ~/project in sandbox)")
      .option("--wait", "wait until upload/deploy finishes"),
  ).action(
    async (
      options: CommonOptions & {
        previewId: string
        projectDir?: string
        wait?: boolean
      },
      cmd: Command,
    ) => {
      const merged = cmd.optsWithGlobals() as typeof options
      const context = await createContext(merged)
      const client = apiClient(context)
      const projectDir = resolveProjectDir(context, merged.projectDir)
      const files = await scanProject(projectDir)
      const result = await uploadPreview(client, merged.previewId, files, Boolean(merged.json))

      let status: PreviewStatusResult | undefined
      if (merged.wait && !result.start.unchanged) {
        status = await waitForPreviewStatus(
          client,
          merged.previewId,
          Boolean(merged.json),
        )
        if (!status) {
          throw new CliError("Timed out waiting for preview deployment.", {
            code: "PreviewTimeout",
          })
        }
        if (status.status !== "ready") {
          throw new CliError(
            status.error
              ? `Preview ${status.status}: ${status.error}`
              : `Preview ${status.status}.`,
            { code: "PreviewDeployFailed" },
          )
        }
      }

      if (merged.json) {
        printJson({
          previewId: merged.previewId,
          status: status?.status ?? result.complete.status,
          unchanged: result.start.unchanged || Boolean(result.complete.unchanged),
          previewStatus: status ?? null,
        })
        return
      }

      console.log(
        `Preview ${merged.previewId}: ${result.start.unchanged || result.complete.unchanged
          ? "unchanged"
          : result.complete.status}`,
      )
      if (status) printPreviewStatus(status)
      if (!merged.wait && !result.start.unchanged) {
        console.log(
          "Check status: neotap interactive preview status --preview-id <preview-id>",
        )
      }
    },
  )

  addCommonOptions(
    preview
      .command("status")
      .description("Get upload and deployment status for a preview")
      .requiredOption("--preview-id <id>", "preview id")
      .option("--wait", "wait until upload/deploy reaches a terminal status"),
  ).action(
    async (
      options: CommonOptions & { previewId: string; wait?: boolean },
      cmd: Command,
    ) => {
      const merged = cmd.optsWithGlobals() as typeof options
      const context = await createContext(merged)
      const client = apiClient(context)
      let result = await getPreviewStatus(client, merged.previewId)
      if (merged.wait && !TERMINAL_PREVIEW_STATUSES.has(result.status)) {
        const waited = await waitForPreviewStatus(
          client,
          merged.previewId,
          Boolean(merged.json),
        )
        if (!waited) {
          throw new CliError("Timed out waiting for preview deployment.", {
            code: "PreviewTimeout",
          })
        }
        result = waited
      }
      if (merged.json) {
        printJson(result)
        return
      }
      printPreviewStatus(result)
    },
  )
}
