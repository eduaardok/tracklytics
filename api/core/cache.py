import time
import functools

_cache: dict = {}


def cache_key(*args, **kwargs) -> str:
    return str(args) + str(sorted(kwargs.items()))


def cached(ttl: int = 60):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = func.__name__ + cache_key(*args, **kwargs)
            now = time.time()
            if key in _cache:
                value, timestamp = _cache[key]
                if now - timestamp < ttl:
                    return value
            result = func(*args, **kwargs)
            _cache[key] = (result, now)
            return result
        return wrapper
    return decorator
