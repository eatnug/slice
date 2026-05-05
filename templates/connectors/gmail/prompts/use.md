# Gmail Connector Use Prompt

Use the Gmail connector only for narrow retrieval context.

## Do

- Ask for a concrete sender, subject, account, or date window when the request is broad.
- Use `gmail_search_messages` before `gmail_get_message`.
- Pass the returned `account` into `gmail_get_message`.
- For calendar retrieval, prefer exact date windows and use `google_calendar_list_calendars` when the event may not be on the primary calendar.

## Boundaries

- Treat MCP output as retrieval context, not source memory.
- Do not capture slices unless the user asks or the retrieved item creates a durable open loop, commitment, or event.
- Do not send, modify, delete, label, or create Google Workspace data.
