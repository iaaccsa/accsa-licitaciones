import redis

r = redis.Redis.from_url("rediss://default:[token]@safe-killdeer-47545.upstash.io:6379")

r.set('foo', 'bar')
value = r.get('foo')