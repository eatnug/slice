# Gmail Connector Install Prompt

Install the curated Slice Gmail connector when the user asks to connect Gmail,
Google Calendar, or Google Workspace.

## Do

1. Run the Slice connector install flow internally. Do not ask the user to run
   `slice connectors ...` commands manually.
2. Sync MCP client config internally after installation.
3. If OAuth desktop credentials are missing, ask the user for the credentials
   file or tell them where to place it:

```text
~/.config/slice/google-workspace-mcp/credentials.json
```

4. Run OAuth from the installed MCP server directory when possible:

```bash
cd .slice/plugins/google-workspace/tools/google_workspace_mcp
uv run google-workspace-auth
```

5. Ask the user to select the Google account in the OAuth browser window.
6. Ask the user to restart Codex, Claude Code, or Gemini only if the MCP client
   must reload config.
7. Verify with `google_workspace_auth_status`.

## Boundaries

- Read-only Gmail and Google Calendar only.
- Keep OAuth credentials and tokens outside the repo.
- Do not ask users to edit absolute MCP paths or app config files manually.
