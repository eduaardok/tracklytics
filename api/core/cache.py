import time
import asyncio
import functools

_cache: dict = {}


def cache_key(*args, **kwargs) -> str:
    return str(args) + str(sorted(kwargs.items()))


def cached(ttl: int = 60):
    """Cachea el resultado de `func` por `ttl` segundos. Soporta tanto
    funciones sync como async (dashboard_executive necesita await a
    pb_client para el desglose de altas por plan) — el decorador detecta el
    tipo con `iscoroutinefunction` y devuelve un wrapper del mismo tipo, para
    no romper el `def` sync de los endpoints ya cacheados."""
    def decorator(func):
        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                key = func.__name__ + cache_key(*args, **kwargs)
                now = time.time()
                if key in _cache:
                    value, timestamp = _cache[key]
                    if now - timestamp < ttl:
                        return value
                result = await func(*args, **kwargs)
                _cache[key] = (result, now)
                return result
            return async_wrapper

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
