---
id: google-workspace
label: Google Workspace
transport: mcp
services:
  - gmail
  - calendar
tools:
  - google_workspace_auth_status
  - google_calendar_list_calendars
  - google_calendar_list_events
  - gmail_search_messages
  - gmail_get_message
---

# Google Workspace Plugin

## When
Use this plugin when Gmail or Google Calendar can provide retrieval context for a Slice repo, or when Google Workspace MCP setup needs inspection.

## Contract
This plugin is a repo-local bridge to an MCP server. The plugin owns the setup guide, MCP example, and local implementation. The repo owns OAuth credentials and account selection.

Plugin files:

```text
.slice/plugins/google-workspace/
  PLUGIN.md
  mcp.json.example
  tools/google_workspace_mcp/
```

Expected repo-local MCP implementation:

```text
.slice/plugins/google-workspace/tools/google_workspace_mcp/
```

Secrets must stay outside the repo:

```text
~/.config/slice/google-workspace-mcp/credentials.json
~/.config/slice/google-workspace-mcp/token.json
```

## Install Flow
When asked to install or connect this plugin, the agent should:

1. Check whether `.slice/plugins/google-workspace/tools/google_workspace_mcp` already exists.
2. If missing, add or copy a Google Workspace MCP server implementation into that directory.
3. Ensure OAuth secrets are ignored and stored outside the repo.
4. Run `slice context <agent>` or `slice connectors sync` from the repo root. The Slice runtime writes the current repo's absolute MCP server path into `.mcp.json`, `.gemini/settings.json`, and `~/.codex/config.toml` when available.
5. Run or instruct the OAuth bootstrap command from `.slice/plugins/google-workspace/tools/google_workspace_mcp`.
6. Restart the MCP client so it reloads config.
7. Verify connection with `google_workspace_auth_status`.

## Use Flow
When using this plugin:

1. Ask narrow retrieval questions.
2. Prefer calendar ranges like today, tomorrow, or a concrete date window.
3. Prefer Gmail queries with sender, company, subject, or date constraints.
4. Treat MCP output as retrieval context.
5. Do not write slices unless the user asks, or unless a durable open loop, commitment, or event should be captured.

## Query Examples

```text
google_calendar_list_events(
  account="all",
  time_min="2026-05-05T00:00:00+09:00",
  time_max="2026-05-06T00:00:00+09:00"
)

gmail_search_messages(
  account="all",
  query="from:person@example.com newer:2026/05/01"
)
```

## Agent Output
When helping install/connect this plugin, return one of:

- setup_required
- connected
- blocked
