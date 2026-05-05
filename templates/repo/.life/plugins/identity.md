---
id: identity
label: Identity
triggers:
  - session_start
  - after_turn
---

# Identity

## When
Use this plugin when stable self-model context is needed, or when the user explicitly confirms a durable identity-level change.

## Do
At `session_start`, read `stories/identity.md` if it exists.

At `after_turn`, only consider updates when the user has explicitly confirmed a stable self-model change. Do not infer identity from transient mood, uncertainty, or assistant synthesis.

## Output
Return one of:

- skipped
- completed
- proposed
- blocked
