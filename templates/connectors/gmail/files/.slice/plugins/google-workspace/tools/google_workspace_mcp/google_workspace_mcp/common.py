from __future__ import annotations

import os
import re
from pathlib import Path
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]

DEFAULT_CONFIG_DIR = Path.home() / ".config" / "slice" / "google-workspace-mcp"
CONFIG_DIR = Path(os.environ.get("GOOGLE_WORKSPACE_MCP_CONFIG_DIR", DEFAULT_CONFIG_DIR))
CREDENTIALS_PATH = Path(
    os.environ.get("GOOGLE_WORKSPACE_MCP_CREDENTIALS", CONFIG_DIR / "credentials.json")
)
TOKEN_PATH = Path(os.environ.get("GOOGLE_WORKSPACE_MCP_TOKEN", CONFIG_DIR / "token.json"))
ACCOUNTS_DIR = Path(os.environ.get("GOOGLE_WORKSPACE_MCP_ACCOUNTS_DIR", CONFIG_DIR / "accounts"))
DEFAULT_ACCOUNT = os.environ.get("GOOGLE_WORKSPACE_MCP_DEFAULT_ACCOUNT", "default")
LOCAL_TZ_NAME = os.environ.get("GOOGLE_WORKSPACE_MCP_TZ", "Asia/Seoul")
LOCAL_TZ = ZoneInfo(LOCAL_TZ_NAME)
ACCOUNT_NAME_RE = re.compile(r"^[A-Za-z0-9_.@-]+$")


class AuthSetupError(RuntimeError):
    """Raised when the local Google OAuth setup is incomplete."""


def ensure_config_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def normalize_account_name(account: str | None = None) -> str:
    name = (account or DEFAULT_ACCOUNT).strip()
    if not name:
        name = DEFAULT_ACCOUNT
    if name == "all":
        raise AuthSetupError("`all` is reserved for querying every configured account.")
    if "/" in name or name in {".", ".."} or not ACCOUNT_NAME_RE.fullmatch(name):
        raise AuthSetupError(
            "Invalid Google Workspace account name. Use letters, numbers, dot, "
            "underscore, hyphen, or @."
        )
    return name


def account_token_path(account: str | None = None) -> Path:
    name = normalize_account_name(account)
    if name == DEFAULT_ACCOUNT:
        return TOKEN_PATH
    return ACCOUNTS_DIR / name / "token.json"


def ensure_account_dir(account: str | None = None) -> None:
    account_token_path(account).parent.mkdir(parents=True, exist_ok=True)


def available_accounts() -> list[str]:
    accounts: list[str] = []
    if TOKEN_PATH.exists():
        accounts.append(DEFAULT_ACCOUNT)
    if ACCOUNTS_DIR.exists():
        for path in sorted(ACCOUNTS_DIR.iterdir()):
            if path.is_dir() and (path / "token.json").exists():
                try:
                    accounts.append(normalize_account_name(path.name))
                except AuthSetupError:
                    continue
    return sorted(set(accounts), key=lambda name: (name != DEFAULT_ACCOUNT, name))


def resolve_requested_accounts(account: str | None = None) -> list[str]:
    if (account or "").strip() == "all":
        return available_accounts()
    return [normalize_account_name(account)]


def load_credentials(account: str | None = None) -> Credentials:
    token_path = account_token_path(account)
    if not CREDENTIALS_PATH.exists():
        raise AuthSetupError(
            f"Missing OAuth client credentials at {CREDENTIALS_PATH}. "
            "Create a Google OAuth Desktop client and save it as credentials.json."
        )
    if not token_path.exists():
        raise AuthSetupError(
            f"Missing OAuth token at {token_path}. "
            "Run `uv run google-workspace-auth --account <name>` from "
            ".slice/plugins/google-workspace/tools/google_workspace_mcp."
        )

    creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if creds.valid:
        return creds

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        return creds

    raise AuthSetupError(
        f"OAuth token exists at {token_path} but is not refreshable. Delete it "
        "and run `uv run google-workspace-auth --account <name>` again."
    )
