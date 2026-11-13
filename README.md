<p align="center">
  <img src="assets/neotap-cli-logo-banner.png" alt="NeoTap CLI" width="300">
</p>

# @neotap.app/cli

NeoTap CLI: Terminal tool for [neotap.app](https://neotap.app) creators: 

- Generate images, videos, 3D assets , audio and etc. with NeoTap Studio AI

- Search and use royalty-free assets in Neotap Studio Assets Library (Comming soon)

- Find global trends and ideas with Neotap Trends (Comming soon)

- Upload, analysis and manage your posts, videos and interactive games (Comming soon)

## Commands

```bash
npx @neotap.app/cli auth
npx @neotap.app/cli task --type sprites-1 --help
npx @neotap.app/cli task submit --type sprites-1 --input '{"sprites":[{"name":"sunflower.png","prompt":"a cartoon sunflower"}]}'
npx @neotap.app/cli task list --status running
npx @neotap.app/cli task get --id <taskId>
```

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
