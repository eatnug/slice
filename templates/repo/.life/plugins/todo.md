---
id: todo
label: Todo
triggers:
  - session_start
  - after_capture
  - after_turn
---

# Todo

## When
Use this plugin when the lifecycle event may affect active attention, open loops, waiting items, deferred items, blocked items, or done items.

## Do
Read the event payload and the relevant memory files. If needed, inspect `stories/todo.md` and relevant slices.

You may run retrieval commands when they help:

```bash
slice retrieve search "waiting"
slice retrieve recent 10
```

If `stories/todo.md` should change, make the smallest update that reflects the source slices. If the update depends on interpretation, ask before writing.

## Output
Return one of:

- skipped
- completed
- proposed
- blocked
