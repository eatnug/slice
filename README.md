# slice

`slice` is a CLI-first runtime for agent-readable personal memory.

It turns a plain git repo into a durable memory system made of small source records, stable entities, collected views, and lifecycle plugins. The goal is to give coding agents and human operators the same working memory without hiding state inside chat history.

## Why it exists

Most "AI memory" turns into either a long transcript, a vector dump, or an app-specific black box. `slice` keeps the source of truth boring:

- one subject in one context becomes one dated slice
- durable names live in an entity registry
- longer surfaces are collected views over source memory
- lifecycle behavior is written as repo-local markdown plugins
- the CLI prints the current operating contract for each agent

The result is memory that is inspectable, versioned, searchable, and easy to hand to Codex, Claude Code, Gemini CLI, or another host.

## Quick Start

```bash
npx --yes slice-memory-cli init
```

Then ask an agent to load the current contract:

```bash
slice context Agent
```

If `slice` is not installed globally, use:

```bash
npm exec --yes --package=slice-memory-cli@latest -- slice context Agent
```

## What a memory repo contains

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

The runtime lives in this package. A memory repo carries only data, config, agent bootloaders, and optional repo-local extensions.

## Core concepts

### Slices

A `slice` is the source memory unit: one subject in one context. It stays small, dated, and literal enough for agents to retrieve without inventing continuity.

```bash
slice slice capture "Design review notes" "2026-05-04" "Reviewed the onboarding flow and captured follow-up questions."
```

### Entities

`entities/registry.yaml` resolves stable people, projects, places, organizations, and concepts so memory can use consistent `[[wikilinks]]` without requiring a database.

### Stories

`stories/` contains collected views: todos, drafts, syntheses, essays, plans, or manually maintained surfaces. Stories are useful views, not source memory.

### Plugins

`.slice/plugins/` contains lifecycle-triggered markdown instructions and repo-local extensions.

```text
.slice/plugins/todo/
  PLUGIN.md
  tools/
  scripts/
  mcp.json.example
```

Plugins can react to events such as `session_start`, `after_capture`, and `after_turn`.

## Agent contract

The agent context files are intentionally small bootloaders:

```text
AGENTS.md
CLAUDE.md
CODEX.md
GEMINI.md
```

They tell each host to read the current operating contract from the CLI:

```bash
slice context <agent>
```

That contract defines the operating loop: brief, retrieve relevant memory, capture durable slices, collect when useful, run lifecycle plugins, and validate writes.

Repos also carry a runtime compatibility range in `.slice/config.json`. `slice context` and `slice validate` block when the CLI or contract version is outside that range.

## Commands

```bash
slice init [repo]
slice briefing [--json] [--recent N]
slice retrieve search <query>
slice retrieve recent [N]
slice slice capture <subject> <at> <content> [--open true|false]
slice lifecycle run <event>
slice context [agent]
slice connectors list
slice connectors show <connector> [--json]
slice connectors install <connector> [--force] [--json]
slice connectors sync [--json]
slice validate [--strict]
slice version
```

`slice connectors list` shows the curated connector catalog bundled with the
runtime. `slice connectors install gmail` installs Slice's Gmail + Google
Calendar connector files, then syncs local MCP client config for the current
machine. `slice context <agent>` also repairs installed connector MCP config when
an installed plugin provides `connector.json`.

Generated MCP client config is machine-local because it contains absolute paths.
New repos created with `slice init` ignore `.mcp.json` and
`.gemini/settings.json` by default.

Legacy aliases are kept for older memory repos:

```bash
slice search <query>
slice capture <subject> <at> <content>
slice lint
```

## Example operating loop

```bash
slice briefing
slice retrieve search "launch planning"
slice slice capture "Launch planning" "2026-05-05" "Finalized the release checklist and assigned follow-up items."
slice lifecycle run after_capture
slice validate
```

## Plugin lifecycle

Plugins are lifecycle-triggered markdown skills. See [Plugin Lifecycle](docs/PLUGIN_LIFECYCLE.md).

Connectors, local tools, scripts, MCP setup, and other repo-specific behavior should live inside plugin folders, for example:

```text
.slice/plugins/google-workspace/
  PLUGIN.md
  mcp.json.example
  tools/google_workspace_mcp/
```

## Local Development

```bash
npm test
npm run check
node bin/slice.mjs --help
```
