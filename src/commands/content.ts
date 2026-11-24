import { open, readFile, stat } from "node:fs/promises"
import { basename, extname } from "node:path"
import type { Command } from "commander"
import { apiClient, createContext, type CliContext } from "../lib/context.js"
import type { CommonOptions } from "../lib/env.js"
import { UsageError } from "../lib/errors.js"
import type { ApiClient } from "../lib/http.js"
import { printJson } from "../lib/output.js"
import { addCommonOptions } from "./options.js"

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
}

const ZIP_MIME = "application/zip"

type I18nText = {
  default: string
  zh_cn?: string
  us_en?: string
}

type MultipartPart = {
  partNumber: number
  uploadUrl: string
  expiresAt: string
  requiredHeaders: Record<string, string>
}

type CreateMultipartResult = {
  fileId: number
  uploadId?: string
  expiresAt: string
  partSize: number
  partCount?: number
  parts?: MultipartPart[]
  existingFile?: { id: number }
}

type CreateUploadResult = {
  fileId: number
  uploadUrl?: string
  expiresAt: string
  requiredHeaders: Record<string, string>
  existingFile?: { id: number }
}

type PartUploadUrl = {
  uploadUrl: string
  expiresAt: string
  requiredHeaders: Record<string, string>
}

type InteractiveVersionDetail = {
  version: {
    id: string
    uploadStatus: string
    lockedAt?: string | null
    versionName?: string | null
    status?: { status?: number | null } | null
  }
}

type PostSummary = {
  id: string
  name: string
  type: string | null
  status: number | null
  publicUrl: string | null
  createdAt?: string
}

function i18nFromOptions(options: {
  title?: string
  titleZh?: string
  titleEn?: string
  description?: string
  descriptionZh?: string
  descriptionEn?: string
}): I18nText | undefined {
  const text = options.title ?? options.description
  if (!text) return undefined
  return {
    default: text,
    ...(options.titleZh ?? options.descriptionZh
      ? { zh_cn: options.titleZh ?? options.descriptionZh }
      : {}),
    ...(options.titleEn ?? options.descriptionEn
      ? { us_en: options.titleEn ?? options.descriptionEn }
      : {}),
  }
}

function videoMimeType(filePath: string): string {
  const mime = VIDEO_MIME_BY_EXT[extname(filePath).toLowerCase()]
  if (!mime) {
    throw new UsageError("Supported video formats: mp4, webm, mov, m4v.")
  }
  return mime
}

async function uploadPart(
  url: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<string> {
  const response = await fetch(url, { method: "PUT", headers, body })
  if (!response.ok) {
    throw new Error(`Part upload failed: HTTP ${response.status} ${await response.text()}`)
  }
  const etag = response.headers.get("etag")
  if (!etag) {
    throw new Error("Part upload response is missing ETag")
  }
  return etag
}

async function uploadVideoMultipart(
  client: ApiClient,
  context: CliContext,
  filePath: string,
  json: boolean,
) {
  const info = await stat(filePath)
  if (!info.isFile()) {
    throw new UsageError(`Not a file: ${filePath}`)
  }
  const mimeType = videoMimeType(filePath)
  const created = await client.post<CreateMultipartResult>("/api/content/video/create-multipart-upload", {
    body: {
      fileName: basename(filePath),
      fileSize: info.size,
      mimeType,
    },
  })

  if (created.existingFile) {
    return { fileId: created.existingFile.id, deduped: true }
  }
  if (!created.uploadId) {
    throw new Error("Multipart upload was not created")
  }

  const handle = await open(filePath, "r")
  const completedParts: Array<{ partNumber: number; eTag: string }> = []
  try {
    const partCount = created.partCount ?? Math.max(1, Math.ceil(info.size / created.partSize))
    const presigned = new Map((created.parts ?? []).map((part) => [part.partNumber, part]))
    let uploadedBytes = 0

    for (let index = 0; index < partCount; index += 1) {
      const partNumber = index + 1
      const offset = index * created.partSize
      const length = Math.min(created.partSize, info.size - offset)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, offset)

      const part =
        presigned.get(partNumber) ??
        (await client.post<PartUploadUrl>("/api/content/video/get-part-upload-url", {
          body: { fileId: created.fileId, uploadId: created.uploadId, partNumber },
        }))

      let etag: string
      try {
        etag = await uploadPart(part.uploadUrl, part.requiredHeaders, buffer)
      } catch {
        const refreshed = await client.post<PartUploadUrl>("/api/content/video/get-part-upload-url", {
          body: { fileId: created.fileId, uploadId: created.uploadId, partNumber },
        })
        etag = await uploadPart(refreshed.uploadUrl, refreshed.requiredHeaders, buffer)
      }

      completedParts.push({ partNumber, eTag: etag })
      uploadedBytes += length
      if (!json) {
        const percent = Math.round((uploadedBytes / info.size) * 100)
        process.stderr.write(`\rUploading video: ${percent}%`)
      }
    }
    if (!json) {
      process.stderr.write("\n")
    }
  } finally {
    await handle.close()
  }

  const result = await client.post<{ file: { id: number } }>("/api/content/video/complete-multipart-upload", {
    body: {
      fileId: created.fileId,
      uploadId: created.uploadId,
      parts: completedParts,
    },
  })
  return { fileId: result.file.id, deduped: false }
}

async function uploadInteractiveZip(
  client: ApiClient,
  filePath: string,
  versionId: string,
  json: boolean,
) {
  const info = await stat(filePath)
  if (!info.isFile()) {
    throw new UsageError(`Not a file: ${filePath}`)
  }
  if (info.size > 32 * 1024 * 1024) {
    throw new UsageError("Interactive zip must be <= 32MB.")
  }
  if (extname(filePath).toLowerCase() !== ".zip") {
    throw new UsageError("Interactive upload expects a .zip file.")
  }

  const created = await client.post<CreateUploadResult>("/api/interactive/version/upload/create", {
    body: {
      versionId,
      fileName: basename(filePath),
      fileSize: info.size,
      mimeType: ZIP_MIME,
    },
  })

  if (created.uploadUrl && !created.existingFile) {
    if (!json) {
      process.stderr.write("Uploading interactive zip...\n")
    }
    const body = await readFile(filePath)
    const response = await fetch(created.uploadUrl, {
      method: "PUT",
      headers: created.requiredHeaders,
      body,
    })
    if (!response.ok) {
      throw new Error(`Zip upload failed: HTTP ${response.status} ${await response.text()}`)
    }
  }

  await client.post("/api/interactive/version/upload/complete", {
    body: { versionId, fileId: created.existingFile?.id ?? created.fileId },
  })
  return { fileId: created.existingFile?.id ?? created.fileId, deduped: Boolean(created.existingFile) }
}

async function resolvePublishApiKeyId(client: ApiClient): Promise<number | undefined> {
  const me = await client.get<{ keyId?: string; key?: { id?: string } }>("/openapi/auth/me")
  const raw = me.keyId ?? me.key?.id
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function waitForInteractiveVersion(
  client: ApiClient,
  versionId: string,
  timeoutMs = 10 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await client.post<InteractiveVersionDetail>("/api/interactive/version/get", {
      body: { versionId },
    })
    const status = result.version.status?.status ?? null
    if (
      result.version.uploadStatus === "upload_failed" ||
      [1001, 1002, 2001, 2002, 2003, 3001, 4001].includes(status ?? 0)
    ) {
      return result.version
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  return undefined
}

function printInteractiveVersion(version: InteractiveVersionDetail["version"]) {
  console.log(`Version: ${version.id}`)
  if (version.versionName) console.log(`Name: ${version.versionName}`)
  console.log(`Upload: ${version.uploadStatus}`)
  console.log(`Status: ${version.status?.status ?? "-"}`)
  console.log(`Locked: ${version.lockedAt ?? "-"}`)
}

export function registerContentCommand(program: Command): void {
  const content = program
    .command("content")
    .description("Create, upload and publish interactive or media content")
    .addHelpText(
      "after",
      `
Interactive flow:
  content interactive create --title "My game"
  content interactive version create <interactive-id> --version-name 1.0
  content interactive upload <version-id> --file ./game.zip
  content interactive publish <version-id> --wait

Media flow:
  content video upload ./video.mp4
  content post publish --type media --media-file-id <file-id> --description "My video"
`,
    )

  registerInteractive(content)
  registerVideo(content)
  registerPost(content)
}

function registerInteractive(content: Command): void {
  const interactive = content
    .command("interactive")
    .description("Manage interactive content and versions")

  addCommonOptions(
    interactive
      .command("create")
      .description("Create an interactive content record")
      .option("--title <text>", "default title")
      .option("--title-zh <text>", "Chinese title")
      .option("--title-en <text>", "English title"),
  ).action(async (options: CommonOptions & { title?: string; titleZh?: string; titleEn?: string }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    const context = await createContext(merged)
    const result = await apiClient(context).post<{ interactive: { id: string } }>("/api/interactive/create", {
      body: { titleI18n: i18nFromOptions(merged) },
    })
    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Created interactive ${result.interactive.id}`)
  })

  const version = interactive
    .command("version")
    .description("Manage interactive versions")

  addCommonOptions(
    version
      .command("create")
      .description("Create a new version under an interactive content")
      .argument("<interactive-id>", "interactive id")
      .requiredOption("--version-name <version>", "version number, e.g. 1 / 1.0 / 1.0.0")
      .option("--title <text>", "default version title")
      .option("--title-zh <text>", "Chinese version title")
      .option("--title-en <text>", "English version title")
      .option("--store-description <text>", "default store description")
      .option("--store-description-zh <text>", "Chinese store description")
      .option("--store-description-en <text>", "English store description")
      .option("--update-description <text>", "default update description")
      .option("--update-description-zh <text>", "Chinese update description")
      .option("--update-description-en <text>", "English update description"),
  ).action(async (interactiveId: string, options: any, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    const context = await createContext(merged)
    const result = await apiClient(context).post<{ version: { id: string } }>("/api/interactive/version/create", {
      body: {
        interactiveId,
        versionName: merged.versionName,
        titleI18n: i18nFromOptions(merged),
        storeDescriptionI18n: i18nFromOptions({
          description: merged.storeDescription,
          descriptionZh: merged.storeDescriptionZh,
          descriptionEn: merged.storeDescriptionEn,
        }),
        versionUpdateDescriptionI18n: i18nFromOptions({
          description: merged.updateDescription,
          descriptionZh: merged.updateDescriptionZh,
          descriptionEn: merged.updateDescriptionEn,
        }),
      },
    })
    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Created interactive version ${result.version.id}`)
  })

  addCommonOptions(
    interactive
      .command("upload")
      .description("Upload a zip for an interactive version")
      .argument("<version-id>", "interactive version id")
      .requiredOption("--file <path>", "zip file path"),
  ).action(async (versionId: string, options: CommonOptions & { file: string }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    const context = await createContext(merged)
    const result = await uploadInteractiveZip(apiClient(context), merged.file, versionId, Boolean(merged.json))
    if (merged.json) {
      printJson({ versionId, ...result })
      return
    }
    console.log(`Uploaded zip for version ${versionId} (file ${result.fileId})`)
  })

  addCommonOptions(
    interactive
      .command("publish")
      .description("Lock an uploaded version, deploy it and enter review")
      .argument("<version-id>", "interactive version id")
      .option("--wait", "wait for validation/deploy result"),
  ).action(async (versionId: string, options: CommonOptions & { wait?: boolean }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    const context = await createContext(merged)
    const client = apiClient(context)
    const published = await client.post<{ version: InteractiveVersionDetail["version"] }>(
      "/api/interactive/version/publish",
      { body: { versionId } },
    )
    if (merged.json && !merged.wait) {
      printJson(published)
      return
    }
    console.log(`Published version ${versionId}; deployment started.`)

    if (merged.wait) {
      const version = await waitForInteractiveVersion(client, versionId)
      if (!version) {
        throw new Error("Timed out waiting for interactive version deployment.")
      }
      if (merged.json) {
        printJson({ version })
        return
      }
      printInteractiveVersion(version)
      if (version.uploadStatus === "upload_failed") {
        process.exitCode = 1
      }
    }
  })

  addCommonOptions(
    interactive
      .command("get")
      .description("Get an interactive version")
      .argument("<version-id>", "interactive version id"),
  ).action(async (versionId: string, options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await apiClient(context).post<InteractiveVersionDetail>("/api/interactive/version/get", {
      body: { versionId },
    })
    if (merged.json) {
      printJson(result)
      return
    }
    printInteractiveVersion(result.version)
  })

  addCommonOptions(
    interactive.command("list").description("List your interactive content"),
  ).action(async (options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await apiClient(context).post<{ interactives: Array<{ id: string; titleI18n?: { default?: string } }> }>(
      "/api/interactive/list",
      { body: {} },
    )
    if (merged.json) {
      printJson(result)
      return
    }
    if (result.interactives.length === 0) {
      console.log("No interactive content found.")
      return
    }
    for (const item of result.interactives) {
      console.log(`${item.id}  ${item.titleI18n?.default ?? "-"}`)
    }
  })
}

function registerVideo(content: Command): void {
  const video = content.command("video").description("Manage video uploads")

  addCommonOptions(
    video
      .command("upload")
      .description("Upload a video file with multipart upload")
      .argument("<file>", "video file path (mp4, webm, mov, m4v)")
      .option("--description <text>", "optional description for display"),
  ).action(async (filePath: string, options: CommonOptions & { description?: string }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    const context = await createContext(merged)
    const result = await uploadVideoMultipart(apiClient(context), context, filePath, Boolean(merged.json))
    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Uploaded video file ${result.fileId}${result.deduped ? " (deduped)" : ""}`)
    console.log(`Publish: neotap content post publish --type media --media-file-id ${result.fileId}`)
  })
}

function registerPost(content: Command): void {
  const post = content.command("post").description("Publish and manage posts")

  addCommonOptions(
    post
      .command("publish")
      .description("Publish a media or interactive post")
      .requiredOption("--type <type>", "media or interactive")
      .option("--media-file-id <id>", "filekit file id for media posts")
      .option("--duration-ms <ms>", "media duration in milliseconds (optional)")
      .option("--interactive-id <id>", "interactive content id for interactive posts")
      .option("--description <text>", "default description")
      .option("--description-zh <text>", "Chinese description")
      .option("--description-en <text>", "English description"),
  ).action(async (options: any, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    if (merged.type !== "media" && merged.type !== "interactive") {
      throw new UsageError("--type must be media or interactive.")
    }
    const context = await createContext(merged)
    const client = apiClient(context)
    const publishCliApiKeyId = await resolvePublishApiKeyId(client)
    if (!publishCliApiKeyId) {
      throw new UsageError("Unable to resolve API key id. Run `neotap auth` again.")
    }
    const body: Record<string, unknown> = {
      type: merged.type,
      descriptionI18n: i18nFromOptions(merged),
      publishSource: "cli",
      ...(publishCliApiKeyId ? { publishCliApiKeyId } : {}),
    }
    if (merged.type === "media") {
      if (!merged.mediaFileId) throw new UsageError("--media-file-id is required for media posts.")
      body.mediaFileId = Number(merged.mediaFileId)
      if (merged.durationMs) body.mediaDurationMs = Number(merged.durationMs)
    } else {
      if (!merged.interactiveId) throw new UsageError("--interactive-id is required for interactive posts.")
      body.interactiveContentId = merged.interactiveId
    }

    const result = await client.post<{ post: { id: string } }>("/api/content/post/publish", { body })
    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Published post ${result.post.id}`)
  })

  addCommonOptions(
    post.command("list").description("List your posts"),
  ).action(async (options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await apiClient(context).post<{ posts: PostSummary[] }>("/api/content/post/list", { body: {} })
    if (merged.json) {
      printJson(result)
      return
    }
    if (result.posts.length === 0) {
      console.log("No posts found.")
      return
    }
    for (const item of result.posts) {
      console.log(`${item.id}  ${item.type ?? "-"}  status=${item.status ?? "-"}  ${item.name}`)
    }
  })

  addCommonOptions(
    post.command("get").description("Get a post").argument("<post-id>", "post id"),
  ).action(async (postId: string, options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await apiClient(context).post("/api/content/post/get", { body: { postId } })
    if (merged.json) {
      printJson(result)
      return
    }
    printJson(result)
  })

  addCommonOptions(
    post
      .command("visibility")
      .description("Show or hide a post")
      .argument("<post-id>", "post id")
      .requiredOption("--visible <boolean>", "true to publish, false to unpublish"),
  ).action(async (postId: string, options: CommonOptions & { visible: string }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as typeof options
    const visible = merged.visible === "true"
    if (merged.visible !== "true" && merged.visible !== "false") {
      throw new UsageError("--visible must be true or false.")
    }
    const context = await createContext(merged)
    const result = await apiClient(context).post("/api/content/post/visibility", {
      body: { postId, visible },
    })
    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Post ${postId} is now ${visible ? "visible" : "hidden"}.`)
  })

  addCommonOptions(
    post.command("delete").description("Delete a post").argument("<post-id>", "post id"),
  ).action(async (postId: string, options: CommonOptions, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as CommonOptions
    const context = await createContext(merged)
    const result = await apiClient(context).post("/api/content/post/delete", { body: { postId } })
    if (merged.json) {
      printJson(result)
      return
    }
    console.log(`Deleted post ${postId}.`)
  })
}
