# Google Workspace MCP

Read-only MCP server for Google Calendar and Gmail in Slice.

## What It Can Read

- Google Calendar events via `calendar.readonly`
- Gmail messages via `gmail.readonly`

It does not create, update, send, delete, or label anything.

## Local Secret Paths

By default, credentials and the default account token live outside this repo:

```text
~/.config/slice/google-workspace-mcp/credentials.json
~/.config/slice/google-workspace-mcp/token.json
```

Additional Google accounts are stored as named account tokens:

```text
~/.config/slice/google-workspace-mcp/accounts/<account>/token.json
```

Example:

```text
~/.config/slice/google-workspace-mcp/accounts/team-attention/token.json
```

You can override them with:

```text
GOOGLE_WORKSPACE_MCP_CONFIG_DIR
GOOGLE_WORKSPACE_MCP_CREDENTIALS
GOOGLE_WORKSPACE_MCP_TOKEN
GOOGLE_WORKSPACE_MCP_ACCOUNTS_DIR
GOOGLE_WORKSPACE_MCP_DEFAULT_ACCOUNT
GOOGLE_WORKSPACE_MCP_TZ
```

The default timezone is `Asia/Seoul`.

## First-Time Setup

1. Create a Google Cloud OAuth client for a desktop app.
2. Enable the Google Calendar API and Gmail API on that Google Cloud project.
3. Save the downloaded OAuth JSON at the canonical path:

```text
~/.config/slice/google-workspace-mcp/credentials.json
```

4. Slice keeps MCP client config in sync automatically when an agent loads the
   Slice contract. You should not edit MCP client files by hand:

```bash
slice context Agent
```

Slice writes the current repo's absolute server path into:

```text
.mcp.json
.gemini/settings.json
~/.codex/config.toml
```

5. Run the OAuth bootstrap once on a new machine:

```bash
cd .slice/plugins/google-workspace/tools/google_workspace_mcp
uv run google-workspace-auth
```

6. Restart Codex, Claude Code, or Gemini so the MCP server registration is loaded.

## Adding Another Google Account

Keep the existing default account and add a named account:

```bash
cd .slice/plugins/google-workspace/tools/google_workspace_mcp
uv run google-workspace-auth --account team-attention
```

The auth flow opens a browser account picker. Select the Google account that owns the
missing calendar. The token will be saved at:

```text
~/.config/slice/google-workspace-mcp/accounts/team-attention/token.json
```

Then restart the client so the running MCP server sees the new token.

Account names are local aliases. Good names:

```text
personal
team-attention
thirdcommit
jake@team-attention.com
```

Use letters, numbers, dot, underscore, hyphen, or `@`.

## Multi-Account Usage

All tools keep using the default account unless you pass `account`.

Check configured accounts:

```text
google_workspace_auth_status(account="all")
```

List calendars visible to each account:

```text
google_calendar_list_calendars(account="all")
```

Search one account's calendar:

```text
google_calendar_list_events(
  account="team-attention",
  time_min="2026-04-20T18:00:00+09:00",
  time_max="2026-04-21T03:00:00+09:00"
)
```

Search every configured account:

```text
google_calendar_list_events(
  account="all",
  time_min="2026-04-20T18:00:00+09:00",
  time_max="2026-04-21T03:00:00+09:00",
  query="Sentience"
)
```

If the target event is not on the primary calendar, first use
`google_calendar_list_calendars` and then pass the returned calendar `id` as
`calendar_id`.

Search Gmail in a non-default account:

```text
gmail_search_messages(
  account="team-attention",
  query="Sentience newer:2026/04/01"
)
```

When reading a specific Gmail message from search results, pass the returned
`account` value to `gmail_get_message`.

## MCP Client Config

Slice keeps the MCP client configs in sync automatically. The generated Codex
block looks like this, with paths filled for the current machine:

```toml
[mcp_servers.google_workspace]
command = "/absolute/path/to/uv"
args = [
  "--directory",
  "/absolute/path/to/repo/.slice/plugins/google-workspace/tools/google_workspace_mcp",
  "run",
  "google-workspace-mcp",
]
env = { GOOGLE_WORKSPACE_MCP_TZ = "Asia/Seoul" }
```

## Claude Code Project Config

Claude Code can load the generated project MCP config from the repo root:

```text
<repo>/.mcp.json
```

Claude Code will ask for approval before using a project-scoped MCP server the first time.

## Gemini CLI Project Config

Gemini CLI can load the checked-in project settings from:

```text
<repo>/.gemini/settings.json
```

The project config only defines `google_workspace`; user-level settings in `~/.gemini/settings.json` remain separate.

## Available Tools

- `google_workspace_auth_status`
- `google_calendar_list_calendars`
- `google_calendar_list_events`
- `gmail_search_messages`
- `gmail_get_message`

Each tool accepts an optional `account` parameter. Use a named account such as
`team-attention`, or use `all` with search/list tools to query every configured
account.

Use Gmail search syntax for `gmail_search_messages`, such as:

```text
from:teddy@sentience.com newer:2026/04/01
subject:Sentience
```
