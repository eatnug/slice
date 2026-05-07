---
name: slice
description: Use the shared slice CLI for memory retrieval, capture, lifecycle plugins, and validation.
---

# Slice

Use `slice briefing`, `slice retrieve search <query>`, `slice slice capture <subject> <at> <content>`, `slice entities show <entity>`, and `slice validate`.

Write each slice as concise structured narrative sentences. Prefer one claim, event, request, decision, concern, or open question per sentence. Use `[[canonical-id]]` for stable subjects and objects when known so capture can update `entities/registry.yaml` mechanically.

Put external context sources, account setup, OAuth, MCP, scripts, and local tools under `.slice/plugins/*/`.
