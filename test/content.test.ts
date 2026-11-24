import http from "node:http"
import type { AddressInfo } from "node:net"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { registerContentCommand } from "../src/commands/content.js"

type Received = {
  method: string
  path: string
  authorization?: string
  body?: any
}

let server: http.Server
let baseUrl: string
let received: Received[] = []
let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "neotap-cli-content-"))
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const raw = Buffer.concat(chunks).toString("utf8")
    const body = req.method === "PUT" || !raw ? undefined : JSON.parse(raw)
    received.push({
      method: req.method ?? "GET",
      path: url.pathname,
      authorization: req.headers.authorization,
      body,
    })

    res.setHeader("content-type", "application/json")

    if (req.method === "PUT" && url.pathname.startsWith("/part/")) {
      res.setHeader("etag", `"etag-${url.pathname.split("/").pop()}"`)
      res.end()
      return
    }

    const ok = (data: unknown) => res.end(JSON.stringify({ success: true, data }))

    if (url.pathname === "/openapi/auth/me") {
      ok({ keyId: "456", type: "cli" })
      return
    }
    if (url.pathname === "/api/interactive/create") {
      ok({ interactive: { id: "interactive-1" } })
      return
    }
    if (url.pathname === "/api/interactive/version/create") {
      ok({ version: { id: "version-1" } })
      return
    }
    if (url.pathname === "/api/interactive/version/publish") {
      ok({ version: { id: "version-1", uploadStatus: "upload_completed" } })
      return
    }
    if (url.pathname === "/api/interactive/version/get") {
      ok({
        version: {
          id: "version-1",
          uploadStatus: "upload_completed",
          status: { status: 1001 },
        },
      })
      return
    }
    if (url.pathname === "/api/content/video/create-multipart-upload") {
      ok({
        fileId: 123,
        uploadId: "upload-1",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        partSize: 5,
        partCount: 2,
        parts: [
          {
            partNumber: 1,
            uploadUrl: `${baseUrl}/part/1`,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            requiredHeaders: {},
          },
          {
            partNumber: 2,
            uploadUrl: `${baseUrl}/part/2`,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            requiredHeaders: {},
          },
        ],
      })
      return
    }
    if (url.pathname === "/api/content/video/complete-multipart-upload") {
      ok({ file: { id: 123 } })
      return
    }
    if (url.pathname === "/api/content/post/publish") {
      ok({ post: { id: "post-1" } })
      return
    }

    res.statusCode = 404
    res.end(JSON.stringify({ success: false, message: "not found" }))
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  await rm(tempDir, { recursive: true, force: true })
})

beforeEach(() => {
  received = []
  process.env.NEOTAP_API_URL = baseUrl
  process.env.NEOTAP_APIKEY = "nt_test"
})

async function run(args: string[]) {
  const program = new Command()
  program.exitOverride()
  registerContentCommand(program)
  await program.parseAsync(["node", "neotap", ...args])
}

describe("content commands", () => {
  it("creates an interactive content with API key auth", async () => {
    await run(["content", "interactive", "create", "--title", "Game", "--json"])
    expect(received[0]).toMatchObject({
      method: "POST",
      path: "/api/interactive/create",
      authorization: "Bearer nt_test",
    })
    expect(received[0]?.body).toEqual({ titleI18n: { default: "Game" } })
  })

  it("creates an interactive version", async () => {
    await run([
      "content",
      "interactive",
      "version",
      "create",
      "interactive-1",
      "--version-name",
      "1.0",
      "--json",
    ])
    expect(received[0]).toMatchObject({
      path: "/api/interactive/version/create",
    })
    expect(received[0]?.body).toMatchObject({
      interactiveId: "interactive-1",
      versionName: "1.0",
    })
  })

  it("publishes and waits for deployment", async () => {
    await run(["content", "interactive", "publish", "version-1", "--wait", "--json"])
    expect(received.map((item) => item.path)).toEqual([
      "/api/interactive/version/publish",
      "/api/interactive/version/get",
    ])
  })

  it("uploads a video with multipart parts", async () => {
    const filePath = path.join(tempDir, "video.mp4")
    await writeFile(filePath, Buffer.alloc(10, 1))

    await run(["content", "video", "upload", filePath, "--json"])

    const create = received.find((item) => item.path === "/api/content/video/create-multipart-upload")
    expect(create?.body).toMatchObject({
      fileName: "video.mp4",
      fileSize: 10,
      mimeType: "video/mp4",
    })
    expect(received.filter((item) => item.method === "PUT")).toHaveLength(2)
    const complete = received.find(
      (item) => item.path === "/api/content/video/complete-multipart-upload",
    )
    expect(complete?.body).toMatchObject({
      fileId: 123,
      uploadId: "upload-1",
      parts: [
        { partNumber: 1, eTag: '"etag-1"' },
        { partNumber: 2, eTag: '"etag-2"' },
      ],
    })
  })

  it("publishes a media post with the resolved API key id", async () => {
    await run([
      "content",
      "post",
      "publish",
      "--type",
      "media",
      "--media-file-id",
      "123",
      "--description",
      "Clip",
      "--json",
    ])
    const publish = received.find((item) => item.path === "/api/content/post/publish")
    expect(publish?.body).toMatchObject({
      type: "media",
      mediaFileId: 123,
      publishSource: "cli",
      publishCliApiKeyId: 456,
      descriptionI18n: { default: "Clip" },
    })
  })
})
