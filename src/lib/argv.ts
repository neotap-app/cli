const ARG_ALIASES: Record<string, string> = {
  "--apikey_id": "--apikey-id",
  "--api_key_id": "--apikey-id",
  "--page_size": "--page-size",
  "--input_file": "--input-file",
  "--studio_project_id": "--studio-project-id",
  "--api_url": "--api-url",
  "--web_url": "--web-url",
}

// 兼容用户习惯的下划线参数名，统一映射到 commander 的连字符选项。
export function normalizeArgv(argv: string[]): string[] {
  return argv.map((value) => {
    const [flag, inlineValue] = value.split("=", 2)
    const normalized = ARG_ALIASES[flag]
    if (!normalized) {
      return value
    }
    return inlineValue === undefined ? normalized : `${normalized}=${inlineValue}`
  })
}
