import { spawn } from "node:child_process"

// 尽力打开系统浏览器；失败时调用方保留 URL 供用户手动打开。
export function tryOpenBrowser(url: string): boolean {
  try {
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open"
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
    const child = spawn(command, args, { detached: true, stdio: "ignore" })
    child.on("error", () => undefined)
    child.unref()
    return true
  } catch {
    return false
  }
}
