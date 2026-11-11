# NeoTap CLI

Node.js + TypeScript CLI for NeoTap creators. Published as `@neotap.app/cli`, binary `neotap`.

## Layout

- `src/index.ts` — entry, global options, error handling
- `src/commands/auth.ts` — browser device authorization, API key login/logout
- `src/commands/task.ts` — docs help, task submit/list/get
- `src/lib/config.ts` — local credentials/config under the OS user config directory
- `src/lib/env.ts` — endpoint overrides, API key precedence, sandbox mode
- `src/lib/http.ts` — fetch wrapper for the `{ success, code, message, data }` envelope
- `test/` — vitest unit tests

## Conventions

- ESM (`"type": "module"`), NodeNext resolution, keep `.js` suffixes in relative imports.
- Do not send `Authorization` when `NEOTAP_CLI_SANDBOX_MODE` is enabled or `--sandbox` is set.
- All HTTP goes through `ApiClient`; surface API `message` fields as `CliError` messages.
- Server endpoints live in the `platform-repo` backend (`modules/openapi`); keep request/response
  types in sync with `specs/features/cli/README.md`.

## Commands

```bash
npm install
npm run dev -- --help
npm run typecheck
npm test          # hermetic unit + local HTTP tests
npm run test:e2e  # optional, needs NEOTAP_E2E_API_URL
npm run build
```
