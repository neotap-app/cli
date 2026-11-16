<p align="center">
  <img src="assets/neotap-cli-logo-banner.png" alt="NeoTap CLI" width="300">
</p>

# @neotap.app/cli

<p align="center">
  <a href="https://www.npmjs.com/package/@neotap.app/cli"><img src="https://img.shields.io/npm/v/@neotap.app%2Fcli?label=npm" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/neotap-app/cli?label=license" alt="license"></a>
</p>

NeoTap CLI: Terminal tool for [neotap.app](https://neotap.app) creators: 

- Generate images, videos, 3D assets , audio and etc. with NeoTap Studio AI

- Search and use royalty-free assets in Neotap Studio Assets Library (Comming soon)

- Find global trends and ideas with Neotap Trends (Comming soon)

- Upload, analysis and manage your posts, videos and interactive games (Comming soon)

## Commands

```bash
npx @neotap.app/cli auth
```

### model

Discover atomic generation models. `model list` supports search, catalog filtering and pagination;
`model get` prints the full input/output schemas, examples, pricing and a ready-to-run task command.
`model catalog list` lists the shared model/workflow catalogs.

```bash
npx @neotap.app/cli model list
npx @neotap.app/cli model list --search image --search sprites
npx @neotap.app/cli model get <model-id>
npx @neotap.app/cli model catalog list
```

`--search` can be repeated or comma-separated (for example `--search sprite,game`),
up to 8 keywords. Every keyword must match the target id, name, description or catalog name.

### workflow

Discover multi-step generation workflows. Workflows use the same task lifecycle as models,
but may run longer and expose workflow-specific input/output schemas.

```bash
npx @neotap.app/cli workflow list
npx @neotap.app/cli workflow list --search sprite --search image
npx @neotap.app/cli workflow get batch-generate-sprite-images
```

`workflow list --search` uses the same multi-keyword rules as `model list`.

### task

Submit and track asynchronous generation tasks. The target can be a model or workflow.
`--kind` is optional: when omitted, the CLI/backend resolves a model first, then a workflow.
Pass the target input with `--input '<json>'` or `--input-file <path>`.

```bash
npx @neotap.app/cli task create batch-generate-sprite-images --input '{"model":"gpt-image-2","sprites":[{"name":"sunflower.png","prompt":"a cartoon sunflower icon"}]}'
npx @neotap.app/cli task create <target-id> --kind workflow --input-file input.json
npx @neotap.app/cli task list --target batch-generate-sprite-images --status running
npx @neotap.app/cli task get <taskId>
```

Task statuses: `pending`, `running`, `succeeded`, `failed`, `canceled`.

Add `--json` to any command for machine-readable output.

Underline aliases such as `--apikey_id`, `--page_size`, `--input_file` are accepted and normalized automatically.

## Authentication

### Browser authorization (recommended)

```bash
neotap auth
```

### Using API key

```bash
neotap auth --apikey nt_xxx
```

or set an environment variable:

```bash
export NEOTAP_APIKEY=nt_xxx
```

## License

Apache 2.0
