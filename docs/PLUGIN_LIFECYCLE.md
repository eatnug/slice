# Plugin Lifecycle

`slice` plugins are lifecycle-triggered markdown skills.

A plugin is not a separate code type. It is a markdown instruction file with small frontmatter that tells the runtime when the file should be surfaced.

```text
lifecycle event -> matching plugin markdown -> agent applies When/Do/Output
```

The runtime does not need to know whether the plugin asks the agent to read files, edit files, run commands, or answer from context. Those instructions live in the markdown body, the same way skills do.

## Plugin File

Plugins live in the memory repo, not in the runtime package:

```text
.slice/plugins/
  todo/
    PLUGIN.md
  identity/
    PLUGIN.md
  google-workspace/
    PLUGIN.md
    mcp.json.example
    tools/
  weekly-rollup/
    PLUGIN.md
    scripts/
```

Minimal frontmatter:

```yaml
---
id: todo
triggers:
  - session_start
  - after_capture
  - after_turn
---
```

Optional frontmatter:

```yaml
label: Todo
```

Do not add permission, approval, runner, or plugin type fields until runtime behavior proves they are needed. Version 1 keeps policy in the plugin text and in the host agent's normal tool rules.

## Body Shape

Use the same shape as a skill:

```md
# Todo

## When
Use this plugin when the lifecycle event may affect active attention, open loops, waiting items, or done items.

## Do
Read the event payload and relevant files. Run commands if the instructions call for it.

```bash
slice retrieve search "waiting"
```

If a file update is needed, make the smallest relevant edit.

## Output
Return one of:

- skipped
- completed
- proposed
- blocked
```

The output terms are conventions for the agent. They are not a strict machine schema yet.

## Lifecycle Events

Start with the events already used by the current slice workflow:

```text
session_start
before_capture
after_capture
after_turn
session_end
```

Only `session_start`, `after_capture`, and `after_turn` are required for the first pass.

## Runtime Responsibility

`slice lifecycle run <event>` should:

1. find the repo by `.slice/config.json`
2. read `.slice/plugins/*/PLUGIN.md`
3. parse frontmatter
4. select plugins whose `triggers` include `<event>`
5. print the matching plugin paths and bodies for the host agent

The runtime does not execute fenced commands in plugin markdown. The host agent reads and follows the plugin instructions using its normal tools.

## Why Not Plugin Types

A plugin can say any of these in its `Do` section:

- read `stories/todo.md`
- run `slice retrieve recent 20`
- edit a story file
- inspect plugin-local generated files
- run plugin-local scripts or tools
- help configure a plugin-local MCP server
- ask the user whether to apply a proposed change
- skip because the event is irrelevant

Those are all just instructions. Splitting plugins into prompt/code/hybrid types before there is pressure to automate them adds schema before it earns its keep.
