# @neotap.app/cli

NeoTap creator CLI: authorize from the terminal, inspect the NeoTap OpenAPI, and run AI generation tasks.

```bash
npx @neotap.app/cli auth
npx @neotap.app/cli task --type sprites-1 --help
npx @neotap.app/cli task submit --type sprites-1 --input '{"sprites":[{"name":"sun.png","prompt":"a pvz game sun sprite"}]}'
npx @neotap.app/cli task list --status running
npx @neotap.app/cli task get --id <taskId>
```

## Requirements

- Node.js >= 20.17

## Authentication

Two ways to connect to the NeoTap OpenAPI:

### Browser authorization (recommended)

```bash
neotap auth
```

The CLI prints an authorization URL and code, tries to open your browser, and waits for approval.
After you approve in the browser it stores an API key in the OS user config directory
(`env-paths("neotap-cli").config/config.json`, mode `0600`).

### API key

```bash
neotap auth --apikey nt_xxx
```

or set an environment variable:

```bash
export NEOTAP_APIKEY=nt_xxx
```

`--apikey` is validated against `GET /openapi/auth/me` before it is saved.

### Sign out

```bash
neotap auth logout
```

Key precedence: `--apikey` > `NEOTAP_APIKEY` > saved config.

## Studio sandbox mode

When the CLI runs inside a NeoTap Studio e2b sandbox, Studio infra intercepts HTTP(S) requests and
injects the API key header. No login is required and the CLI must not send `Authorization`:

```bash
NEOTAP_CLI_SANDBOX_MODE=true neotap task list
neotap task list --sandbox   # local debugging switch
```

## Endpoints

Defaults:

- API: `https://api.neotap.app`
- Web: `https://neotap.app`

Override with `--api-url` / `--web-url` or `NEOTAP_API_URL` / `NEOTAP_WEB_URL` (for local testing):

```bash
neotap task list --api-url http://localhost:3001
NEOTAP_API_URL=http://localhost:3001 neotap task get --id 123
```

## Commands

| Command | Description |
| --- | --- |
| `neotap auth [--apikey <key>] [--logout]` | Browser or API key authorization |
| `neotap task --help` | Task command help plus available task types |
| `neotap task --type <type> --help` | Input schema, example and submit command for a task type |
| `neotap task submit --type <type> (--input <json> \| --input-file <path>)` | Submit an async task |
| `neotap task list [--type] [--status] [--apikey-id] [--cursor] [--page-size]` | List tasks (`--status` repeatable or comma-separated) |
| `neotap task get --id <id>` | Get task status and output |

Add `--json` to any command for machine-readable output.

Underline aliases such as `--apikey_id`, `--page_size`, `--input_file`,
`--studio_project_id` are accepted and normalized automatically.

## Development

```bash
npm install
npm run dev -- --help
npm run typecheck
npm test
npm run build
```

### Tests

- `npm test` runs hermetic unit/HTTP tests (no network).
- `npm run test:e2e` runs optional contract tests against a live backend:

```bash
NEOTAP_E2E_API_URL=http://localhost:3001 npm run test:e2e
# include an API key to also test /openapi/auth/me
NEOTAP_E2E_API_URL=http://localhost:3001 NEOTAP_E2E_APIKEY=nt_xxx npm run test:e2e
```

## License

MIT
