import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CliError } from "../src/lib/errors.js"
import { ApiClient } from "../src/lib/http.js"

type Received = {
  authorization?: string
  url: URL
}

let server: http.Server
let baseUrl: string
let received: Received[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    received.push({ authorization: req.headers.authorization, url })
    res.setHeader("content-type", "application/json")

    if (url.pathname === "/fail") {
      res.end(JSON.stringify({ success: false, code: "UnsupportedTaskType", message: "nope" }))
      return
    }
    if (url.pathname === "/http-error") {
      res.statusCode = 401
      res.end(JSON.stringify({ success: false, code: "Unauthorized", message: "bad key" }))
      return
    }
    res.end(JSON.stringify({ success: true, code: "Success", data: { ok: true } }))
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

describe("ApiClient", () => {
  it("sends the API key as a bearer token", async () => {
    received = []
    const client = new ApiClient({ baseUrl, apiKey: "nt_test" })
    await client.get("/ok")
    expect(received[0]?.authorization).toBe("Bearer nt_test")
  })

  it("never sends Authorization in sandbox mode", async () => {
    received = []
    const client = new ApiClient({ baseUrl, apiKey: "nt_test", sandbox: true })
    await client.get("/ok")
    expect(received[0]?.authorization).toBeUndefined()
  })

  it("serializes repeated query values", async () => {
    received = []
    const client = new ApiClient({ baseUrl })
    await client.get("/ok", { query: { status: ["running", "failed"], pageSize: 5, type: undefined } })
    const url = received[0]!.url
    expect(url.searchParams.getAll("status")).toEqual(["running", "failed"])
    expect(url.searchParams.get("pageSize")).toBe("5")
    expect(url.searchParams.has("type")).toBe(false)
  })

  it("throws CliError with API code and message on success=false", async () => {
    const client = new ApiClient({ baseUrl })
    await expect(client.get("/fail")).rejects.toMatchObject({
      name: "CliError",
      message: "nope",
      code: "UnsupportedTaskType",
    })
  })

  it("throws CliError on HTTP errors", async () => {
    const client = new ApiClient({ baseUrl })
    const error = await client.get("/http-error").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CliError)
    expect(error).toMatchObject({ message: "bad key", status: 401 })
  })
})
