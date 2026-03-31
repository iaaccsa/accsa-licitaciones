import secrets
from datetime import datetime, timedelta, timezone

_upload_tokens: dict[str, datetime] = {}

TOKEN_TTL_SECONDS = 300


def create_upload_token() -> str:
    token = "tok_" + secrets.token_urlsafe(32)
    _upload_tokens[token] = datetime.now(timezone.utc) + timedelta(seconds=TOKEN_TTL_SECONDS)
    return token


def consume_upload_token(token: str) -> bool:
    """Validate and consume (delete) the token. Returns True if valid."""
    expiry = _upload_tokens.get(token)
    if expiry is None:
        return False
    if datetime.now(timezone.utc) > expiry:
        del _upload_tokens[token]
        return False
    del _upload_tokens[token]
    return True
