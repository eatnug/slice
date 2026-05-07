# Slice Memory Contract

Use the shared `slice` CLI for memory operations.

- Startup: `slice briefing`
- Retrieve: `slice retrieve search <query>`
- Capture: `slice slice capture "<subject>" "<at>" "<content>"`
- Slice writing: describe each slice as concise subject-predicate-object-style sentences; mark stable referents with `[[canonical-id]]` when known.
- Entities: capture updates `entities/registry.yaml` and slice frontmatter mechanically; inspect with `slice entities show <entity>`.
- Validate: `slice validate`
- Extensions: put connectors, tools, scripts, and MCP setup under `.slice/plugins/*/`.
