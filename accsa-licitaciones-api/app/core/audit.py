"""Actor extraction from request headers for audit logging.

The UI proxy (server-side, already authenticated by Supabase) forwards trusted
headers: X-User-Id, X-User-Email. Client IP and user agent are read from the
forwarded request headers. None of these are required: system/service calls
produce an empty actor.
"""
from dataclasses import dataclass
from typing import Optional
from fastapi import Request


@dataclass
class Actor:
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


def actor_from_request(request: Request) -> Actor:
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    return Actor(
        user_id=request.headers.get("X-User-Id"),
        user_email=request.headers.get("X-User-Email"),
        ip_address=ip,
        user_agent=request.headers.get("User-Agent"),
    )


def get_actor(request: Request) -> Actor:
    return actor_from_request(request)
