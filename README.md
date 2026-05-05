# slice

`slice` is a CLI-first runtime for Life OS style memory repositories.

The runtime lives in this package. A user memory repo only needs data and thin config:

```text
slices/
stories/
entities/registry.yaml
.life/config.json
.life/plugins/
```

## Commands

```bash
slice init [repo]
slice briefing [--json] [--recent N]
slice retrieve search <query>
slice retrieve recent [N]
slice slice capture <subject> <at> <content> [--open true|false]
slice lifecycle run <event>
slice validate [--strict]
```

Plugins are lifecycle-triggered markdown skills. See [Plugin Lifecycle](docs/PLUGIN_LIFECYCLE.md).

Legacy aliases are kept for the current Life OS surface:

```bash
slice search <query>
slice capture <subject> <at> <content>
slice lint
```

## Local Development

```bash
npm test
npm run check
node bin/slice.mjs --help
```
