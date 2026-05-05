from __future__ import annotations

import argparse

from google_auth_oauthlib.flow import InstalledAppFlow

from .common import (
    CREDENTIALS_PATH,
    DEFAULT_ACCOUNT,
    SCOPES,
    account_token_path,
    ensure_account_dir,
    ensure_config_dir,
    normalize_account_name,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap a read-only Google Workspace token.")
    parser.add_argument(
        "--account",
        default=DEFAULT_ACCOUNT,
        help=(
            "Local account name for this token. Use a stable alias such as "
            "`personal`, `team-attention`, or the email address. Defaults to "
            f"`{DEFAULT_ACCOUNT}`."
        ),
    )
    args = parser.parse_args()

    account = normalize_account_name(args.account)
    token_path = account_token_path(account)

    ensure_config_dir()
    ensure_account_dir(account)
    if not CREDENTIALS_PATH.exists():
        raise SystemExit(
            f"Missing {CREDENTIALS_PATH}.\n"
            "Create a Google OAuth Desktop client, download the JSON file, and save it there."
        )

    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent select_account", access_type="offline")
    token_path.write_text(creds.to_json(), encoding="utf-8")
    print(f"Saved Google OAuth token for account `{account}` to {token_path}")


if __name__ == "__main__":
    main()
