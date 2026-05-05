# slice

`slice` is a CLI-first runtime for personal memory repositories.

The product idea is simple: durable memory should be made of small source records, not one giant journal or a chat transcript. A `slice` captures one subject in one context. Larger surfaces can gather slices later, but the source material stays small, dated, searchable, and easy for agents to handle.

This can be used as a second brain, a personal operating log, a research notebook, or a long-running working memory for agents. The domain language stays the same either way:

- `slices/` contains source memory.
- `entities/` resolves stable people, projects, places, organizations, and concepts.
- `stories/` contains longer views, drafts, syntheses, essays, or manually maintained surfaces.
- `.life/plugins/` contains lifecycle-triggered markdown skills.

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

Legacy aliases are kept for the current in-repo memory surface:

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
