import type { Command } from "commander"

export function addCommonOptions(command: Command): Command {
  return command
    .option("--api-url <url>", "NeoTap API base URL (default: https://api.neotap.app)")
    .option("--web-url <url>", "NeoTap web base URL (default: https://neotap.app)")
    .option("--json", "print machine-readable JSON output")
    .option("--sandbox", "Studio sandbox mode: do not send Authorization headers")
}
