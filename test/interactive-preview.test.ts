import { createHash } from "node:crypto"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { registerInteractivePreviewCommand } from "../src/commands/interactive-preview.js"

type Received = {
  method: string
  path: string
  body?: any
}

let server: http.Server
let baseUrl: string
let received: Received[] = []
let tempDir: string
let projectDir: string

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "neotap-cli-preview-"))
  projectDir = path.join(tempDir, "project")
  await mkdir(projectDir, { recursive: true })
  await writeFile(path.join(projectDir, "index.html"), "<h1>preview</h1>")
  await writeFile(path.join(projectDir, "game.js"), "console.log('game')")

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
      body,
    })

    res.setHeader("content-type", "application/json")
    const ok = (data: unknown) => res.end(JSON.stringify({ success: true, data }))

    if (req.method === "PUT" && url.pathname.startsWith("/preview-blob/")) {
      res.end()
      return
    }
    if (url.pathname === "/openapi/interactive-preview/start-upload") {
      const files = (body.files as Array<[string, string, number]>).map(
        ([filePath, hash, size]) => ({
          path: filePath,
          sha256: hash,
          size,
          blobKey: `preview-blobs/${hash}`,
          uploadUrl: `${baseUrl}/preview-blob/${hash}`,
          requiredHeaders: {
            "Content-Type": "text/plain",
            "Content-Length": String(size),
            "x-amz-checksum-sha256": Buffer.from(hash, "hex").toString("base64"),
          },
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
      )
      ok({
        previewId: body.previewId,
        unchanged: false,
        uploads: files,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      })
      return
    }
    if (url.pathname === "/openapi/interactive-preview/complete-upload") {
      ok({
        previewId: body.previewId,
        status: "deploying",
        workflowId: "wf-1",
      })
      return
    }
    if (url.pathname === "/openapi/interactive-preview/get-status") {
      ok({
        previewId: body.previewId,
        projectId: "22222222-2222-4222-8222-222222222222",
        status: "ready",
        fileCount: 2,
        totalSize: 31,
        error: null,
        uploadStartedAt: new Date().toISOString(),
        uploadExpiresAt: null,
        deployStartedAt: new Date().toISOString(),
        deployExpiresAt: null,
        readyAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
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
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  await rm(tempDir, { recursive: true, force: true })
})

beforeEach(() => {
  received = []
  process.env.NEOTAP_API_URL = baseUrl
  process.env.NEOTAP_APIKEY = "nt_preview"
  delete process.env.NEOTAP_CLI_SANDBOX_MODE
})

async function run(args: string[]) {
  const program = new Command()
  program.exitOverride()
  registerInteractivePreviewCommand(program)
  await program.parseAsync(["node", "neotap", ...args])
}

describe("interactive preview commands", () => {
  it("scans a project, uploads changed files and completes deploy", async () => {
    await run([
      "interactive",
      "preview",
      "upload",
      "--preview-id",
      "11111111-1111-4111-8111-111111111111",
      "--project-dir",
      projectDir,
      "--wait",
      "--json",
    ])

    const start = received.find(
      (item) => item.path === "/openapi/interactive-preview/start-upload",
    )
    expect(start?.body).toMatchObject({
      previewId: "11111111-1111-4111-8111-111111111111",
    })
    const files = start?.body.files as Array<[string, string, number]>
    expect(files.map(([filePath]) => filePath)).toEqual(["game.js", "index.html"])
    expect(files.find(([filePath]) => filePath === "index.html")?.[1]).toBe(
      sha256("<h1>preview</h1>"),
    )

    expect(received.filter((item) => item.method === "PUT")).toHaveLength(2)
    const complete = received.find(
      (item) => item.path === "/openapi/interactive-preview/complete-upload",
    )
    expect(complete?.body).toEqual({
      previewId: "11111111-1111-4111-8111-111111111111",
    })
    expect(
      received.some(
        (item) => item.path === "/openapi/interactive-preview/get-status",
      ),
    ).toBe(true)
  })

  it("gets preview upload status", async () => {
    await run([
      "interactive",
      "preview",
      "status",
      "--preview-id",
      "11111111-1111-4111-8111-111111111111",
      "--json",
    ])
    const status = received.find(
      (item) => item.path === "/openapi/interactive-preview/get-status",
    )
    expect(status?.body).toEqual({
      previewId: "11111111-1111-4111-8111-111111111111",
    })
  })
})
