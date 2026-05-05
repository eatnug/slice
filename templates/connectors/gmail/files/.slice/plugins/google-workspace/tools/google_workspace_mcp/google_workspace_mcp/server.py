from __future__ import annotations

import base64
import html
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from mcp.server.fastmcp import FastMCP

from .common import (
    ACCOUNTS_DIR,
    CREDENTIALS_PATH,
    DEFAULT_ACCOUNT,
    LOCAL_TZ,
    LOCAL_TZ_NAME,
    SCOPES,
    AuthSetupError,
    account_token_path,
    available_accounts,
    load_credentials,
    resolve_requested_accounts,
)

mcp = FastMCP("Slice Google Workspace", json_response=True)


def _service(api: str, version: str, account: str | None = None):
    return build(api, version, credentials=load_credentials(account))


def _http_error(error: HttpError, account: str | None = None) -> dict[str, Any]:
    response = {
        "error": "google_api_error",
        "status": getattr(error.resp, "status", None),
        "reason": str(error),
    }
    if account is not None:
        response["account"] = account
    return response


def _auth_error(error: AuthSetupError, account: str | None = None) -> dict[str, Any]:
    response = {"error": "auth_setup_error", "message": str(error)}
    if account is not None:
        response["account"] = account
    return response


def _parse_local_datetime(value: str | None, default: datetime) -> datetime:
    if not value:
        return default

    text = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        parsed = datetime.combine(date.fromisoformat(text), time.min, LOCAL_TZ)
    else:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=LOCAL_TZ)

    return parsed.astimezone(timezone.utc)


def _rfc3339_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _truncate(value: str | None, max_chars: int = 800) -> str | None:
    if not value:
        return None
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."


def _header(headers: list[dict[str, str]], name: str) -> str | None:
    needle = name.lower()
    for header in headers:
        if header.get("name", "").lower() == needle:
            return header.get("value")
    return None


def _decode_body_data(data: str | None) -> str:
    if not data:
        return ""
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8", "replace")


def _walk_parts(payload: dict[str, Any]):
    yield payload
    for part in payload.get("parts", []) or []:
        yield from _walk_parts(part)


def _plain_body(payload: dict[str, Any]) -> str | None:
    html_body = None
    for part in _walk_parts(payload):
        mime_type = part.get("mimeType")
        body = _decode_body_data(part.get("body", {}).get("data"))
        if not body:
            continue
        if mime_type == "text/plain":
            return body
        if mime_type == "text/html" and html_body is None:
            stripped = re.sub(r"<(br|p|div|li)[^>]*>", "\n", body, flags=re.IGNORECASE)
            stripped = re.sub(r"<[^>]+>", "", stripped)
            html_body = html.unescape(stripped)
    return html_body


@mcp.tool()
def google_workspace_auth_status(account: str | None = None) -> dict[str, Any]:
    """Check whether local Google Workspace OAuth credentials are configured."""
    try:
        account_names = resolve_requested_accounts(account)
    except AuthSetupError as exc:
        return _auth_error(exc)

    if not account_names:
        account_names = [DEFAULT_ACCOUNT]

    statuses = []
    for account_name in account_names:
        ready = False
        error = None
        try:
            load_credentials(account_name)
            ready = True
        except AuthSetupError as exc:
            error = str(exc)
        statuses.append(
            {
                "account": account_name,
                "ready": ready,
                "error": error,
                "token_path": str(account_token_path(account_name)),
            }
        )

    default_status = next(
        (status for status in statuses if status["account"] == DEFAULT_ACCOUNT),
        statuses[0],
    )
    return {
        "ready": default_status["ready"],
        "error": default_status["error"],
        "default_account": DEFAULT_ACCOUNT,
        "accounts": statuses,
        "available_accounts": available_accounts(),
        "credentials_path": str(CREDENTIALS_PATH),
        "accounts_dir": str(ACCOUNTS_DIR),
        "token_path": str(account_token_path(DEFAULT_ACCOUNT)),
        "timezone": LOCAL_TZ_NAME,
        "scopes": SCOPES,
        "read_only": True,
    }


@mcp.tool()
def google_calendar_list_calendars(
    account: str | None = None,
    max_results: int = 50,
) -> dict[str, Any]:
    """List calendars visible to one configured Google account, or every account."""
    limit = min(max(max_results, 1), 250)
    try:
        account_names = resolve_requested_accounts(account)
    except AuthSetupError as exc:
        return _auth_error(exc)

    if not account_names:
        return {
            "error": "auth_setup_error",
            "message": (
                "No configured Google Workspace accounts. Run "
                "`uv run google-workspace-auth --account <name>`."
            ),
        }

    calendars = []
    errors = []
    single_account = len(account_names) == 1
    for account_name in account_names:
        try:
            result = (
                _service("calendar", "v3", account_name)
                .calendarList()
                .list(maxResults=limit)
                .execute()
            )
        except AuthSetupError as exc:
            if single_account:
                return _auth_error(exc, account_name)
            errors.append(_auth_error(exc, account_name))
            continue
        except HttpError as exc:
            if single_account:
                return _http_error(exc, account_name)
            errors.append(_http_error(exc, account_name))
            continue

        for calendar in result.get("items", []) or []:
            calendars.append(
                {
                    "account": account_name,
                    "id": calendar.get("id"),
                    "summary": calendar.get("summary"),
                    "primary": calendar.get("primary", False),
                    "selected": calendar.get("selected", False),
                    "access_role": calendar.get("accessRole"),
                    "time_zone": calendar.get("timeZone"),
                    "background_color": calendar.get("backgroundColor"),
                }
            )

    response = {
        "account": account or DEFAULT_ACCOUNT,
        "accounts": account_names,
        "calendars": calendars[:limit] if not single_account else calendars,
    }
    if errors:
        response["errors"] = errors
    return response


@mcp.tool()
def google_calendar_list_events(
    time_min: str | None = None,
    time_max: str | None = None,
    query: str | None = None,
    calendar_id: str = "primary",
    account: str | None = None,
    max_results: int = 20,
) -> dict[str, Any]:
    """List Google Calendar events in a time window using read-only access."""
    now = datetime.now(LOCAL_TZ)
    start = _parse_local_datetime(time_min, now)
    end = _parse_local_datetime(time_max, now + timedelta(days=14))
    limit = min(max(max_results, 1), 50)
    try:
        account_names = resolve_requested_accounts(account)
    except AuthSetupError as exc:
        return _auth_error(exc)

    if not account_names:
        return {
            "error": "auth_setup_error",
            "message": (
                "No configured Google Workspace accounts. Run "
                "`uv run google-workspace-auth --account <name>`."
            ),
        }

    events = []
    errors = []
    single_account = len(account_names) == 1
    for account_name in account_names:
        try:
            events_result = (
                _service("calendar", "v3", account_name)
                .events()
                .list(
                    calendarId=calendar_id,
                    timeMin=_rfc3339_utc(start),
                    timeMax=_rfc3339_utc(end),
                    q=query,
                    maxResults=limit,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
        except AuthSetupError as exc:
            if single_account:
                return _auth_error(exc, account_name)
            errors.append(_auth_error(exc, account_name))
            continue
        except HttpError as exc:
            if single_account:
                return _http_error(exc, account_name)
            errors.append(_http_error(exc, account_name))
            continue

        for event in events_result.get("items", []):
            start_value = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
            end_value = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date")
            events.append(
                {
                    "account": account_name,
                    "id": event.get("id"),
                    "summary": event.get("summary"),
                    "start": start_value,
                    "end": end_value,
                    "location": event.get("location"),
                    "status": event.get("status"),
                    "html_link": event.get("htmlLink"),
                    "attendees": [
                        {
                            "email": attendee.get("email"),
                            "display_name": attendee.get("displayName"),
                            "response_status": attendee.get("responseStatus"),
                        }
                        for attendee in event.get("attendees", []) or []
                    ],
                    "description_excerpt": _truncate(event.get("description")),
                }
            )

    events.sort(key=lambda event: event.get("start") or "")
    response = {
        "account": account or DEFAULT_ACCOUNT,
        "accounts": account_names,
        "calendar_id": calendar_id,
        "time_min": _rfc3339_utc(start),
        "time_max": _rfc3339_utc(end),
        "query": query,
        "events": events[:limit] if not single_account else events,
    }
    if errors:
        response["errors"] = errors
    return response

@mcp.tool()
def gmail_search_messages(
    query: str,
    max_results: int = 10,
    include_body: bool = False,
    body_max_chars: int = 2000,
    account: str | None = None,
) -> dict[str, Any]:
    """Search Gmail messages using Gmail search syntax and read-only access."""
    limit = min(max(max_results, 1), 25)
    try:
        account_names = resolve_requested_accounts(account)
    except AuthSetupError as exc:
        return _auth_error(exc)

    if not account_names:
        return {
            "error": "auth_setup_error",
            "message": (
                "No configured Google Workspace accounts. Run "
                "`uv run google-workspace-auth --account <name>`."
            ),
        }

    messages = []
    errors = []
    single_account = len(account_names) == 1
    for account_name in account_names:
        try:
            service = _service("gmail", "v1", account_name)
            results = service.users().messages().list(userId="me", q=query, maxResults=limit).execute()
            message_refs = results.get("messages", []) or []
            for message in message_refs:
                summary = _gmail_message_summary(service, message["id"], include_body, body_max_chars)
                summary["account"] = account_name
                messages.append(summary)
        except AuthSetupError as exc:
            if single_account:
                return _auth_error(exc, account_name)
            errors.append(_auth_error(exc, account_name))
        except HttpError as exc:
            if single_account:
                return _http_error(exc, account_name)
            errors.append(_http_error(exc, account_name))

    response = {
        "account": account or DEFAULT_ACCOUNT,
        "accounts": account_names,
        "query": query,
        "messages": messages[:limit] if not single_account else messages,
    }
    if errors:
        response["errors"] = errors
    return response


@mcp.tool()
def gmail_get_message(
    message_id: str,
    include_body: bool = True,
    body_max_chars: int = 4000,
    account: str | None = None,
) -> dict[str, Any]:
    """Get one Gmail message by id using read-only access."""
    try:
        account_names = resolve_requested_accounts(account)
    except AuthSetupError as exc:
        return _auth_error(exc)
    if len(account_names) != 1:
        return {
            "error": "invalid_account",
            "message": "gmail_get_message requires one account. Use the account from gmail_search_messages.",
        }
    account_name = account_names[0]
    try:
        service = _service("gmail", "v1", account_name)
        summary = _gmail_message_summary(service, message_id, include_body, body_max_chars)
        summary["account"] = account_name
        return summary
    except AuthSetupError as exc:
        return _auth_error(exc, account_name)
    except HttpError as exc:
        return _http_error(exc, account_name)


def _gmail_message_summary(service, message_id: str, include_body: bool, body_max_chars: int):
    message_format = "full" if include_body else "metadata"
    request_args = {"userId": "me", "id": message_id, "format": message_format}
    if not include_body:
        request_args["metadataHeaders"] = ["From", "To", "Cc", "Subject", "Date"]
    message = service.users().messages().get(**request_args).execute()
    headers = message.get("payload", {}).get("headers", []) or []
    summary = {
        "id": message.get("id"),
        "thread_id": message.get("threadId"),
        "label_ids": message.get("labelIds", []),
        "from": _header(headers, "From"),
        "to": _header(headers, "To"),
        "cc": _header(headers, "Cc"),
        "subject": _header(headers, "Subject"),
        "date": _header(headers, "Date"),
        "snippet": message.get("snippet"),
    }
    if include_body:
        summary["body_excerpt"] = _truncate(
            _plain_body(message.get("payload", {}) or {}),
            max(200, min(body_max_chars, 12000)),
        )
    return summary


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
