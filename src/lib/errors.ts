export class CliError extends Error {
  readonly code?: string
  readonly status?: number

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message)
    this.name = "CliError"
    this.code = options.code
    this.status = options.status
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, { code: "UsageError" })
    this.name = "UsageError"
  }
}
