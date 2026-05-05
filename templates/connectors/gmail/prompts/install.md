# Gmail Connector Install Prompt

Install the curated Slice Gmail connector from this connector folder.

## Do

1. Copy the connector `files/` payload into the Slice repo.
2. Run `slice connectors sync` so the repo-local `connector.json` manifest is materialized into local MCP client config.
3. Tell the user to place Google OAuth desktop credentials at:

```text
~/.config/slice/google-workspace-mcp/credentials.json
```

4. Run OAuth from the installed MCP server directory:

```bash
cd .slice/plugins/google-workspace/tools/google_workspace_mcp
uv run google-workspace-auth
```

5. Restart the MCP client and verify with `google_workspace_auth_status`.

## Boundaries

- Read-only Gmail and Google Calendar only.
- Keep OAuth credentials and tokens outside the repo.
- Do not ask users to edit absolute MCP paths manually.
