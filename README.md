# slice

`slice` is a CLI-first runtime for personal memory repositories.

The product idea is simple: durable memory should be made of small source records, not one giant journal or a chat transcript. A `slice` captures one subject in one context. Larger surfaces can gather slices later, but the source material stays small, dated, searchable, and easy for agents to handle.

This can be used as a second brain, a personal operating log, a research notebook, or a long-running working memory for agents. The domain language stays the same either way:

- `slices/` contains source memory.
- `entities/` resolves stable people, projects, places, organizations, and concepts.
- `stories/` contains longer views, drafts, syntheses, essays, or manually maintained surfaces.
- `.slice/plugins/` contains lifecycle-triggered markdown skills and repo-local extensions.

The runtime lives in this package. A user memory repo only needs data and thin config:

```text
slices/
stories/
entities/registry.yaml
.slice/config.json
.slice/plugins/
AGENTS.md
CLAUDE.md
CODEX.md
GEMINI.md
.codex/skills/slice/
.claude/skills/slice/
.gemini/extensions/slice/
```

The agent context files are minimal bootloaders. They only tell the agent to read the current operating contract from the CLI:

```bash
slice context <agent>
```

That CLI contract defines the basic operating loop: retrieve relevant memory, capture durable source slices, collect slices into stories/entities when useful, run lifecycle plugins, and validate writes. This keeps repo files stable while runtime behavior can evolve with package updates.

Repos also carry a runtime compatibility range in `.slice/config.json`. `slice context` and `slice validate` block when the CLI version or contract version is outside that range.

## Commands

Use with npm:

```bash
npx slice-memory-cli init
```

```bash
slice init [repo]
slice briefing [--json] [--recent N]
slice retrieve search <query>
slice retrieve recent [N]
slice slice capture <subject> <at> <content> [--open true|false]
slice lifecycle run <event>
slice context [agent]
slice validate [--strict]
slice version
```

Plugins are lifecycle-triggered markdown skills. See [Plugin Lifecycle](docs/PLUGIN_LIFECYCLE.md).

Connectors, local tools, scripts, MCP setup, and other repo-specific behavior should live inside plugin folders, for example:

```text
.slice/plugins/google-workspace/
  PLUGIN.md
  mcp.json.example
  tools/google_workspace_mcp/
```

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
