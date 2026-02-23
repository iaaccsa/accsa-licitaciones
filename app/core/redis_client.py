import redis
from app.core.config import get_settings

settings = get_settings()

redis_client = redis.Redis.from_url(settings.UPSTASH_REDIS_REST_URL, decode_responses=True)
