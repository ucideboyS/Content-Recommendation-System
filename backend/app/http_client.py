"""
Shared HTTP client with connection pooling, retries, and timeouts.
Fixes ConnectionResetError(10054) caused by rapid sequential requests
without connection reuse.
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singleton session — reuses TCP connections, retries on transient errors
# ---------------------------------------------------------------------------
_session = None


def get_session() -> requests.Session:
    """Return a shared requests.Session with retry + backoff configured."""
    global _session
    if _session is not None:
        return _session

    _session = requests.Session()

    retry_strategy = Retry(
        total=3,                    # retry up to 3 times
        backoff_factor=0.5,         # wait 0.5s, 1s, 2s between retries
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )

    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=10,        # keep 10 connections alive
        pool_maxsize=20,            # max 20 concurrent connections
    )

    _session.mount("https://", adapter)
    _session.mount("http://", adapter)

    logger.info("Shared HTTP session initialized with retry + pooling")
    return _session


# ---------------------------------------------------------------------------
# Convenience wrappers with default timeouts
# ---------------------------------------------------------------------------
DEFAULT_TIMEOUT = (5, 15)  # (connect_timeout, read_timeout) in seconds


def safe_get(url: str, params: dict = None, timeout=DEFAULT_TIMEOUT, **kwargs):
    """GET with timeout, retry, and connection pooling."""
    session = get_session()
    return session.get(url, params=params, timeout=timeout, **kwargs)


def safe_post(url: str, json: dict = None, timeout=DEFAULT_TIMEOUT, **kwargs):
    """POST with timeout, retry, and connection pooling."""
    session = get_session()
    return session.post(url, json=json, timeout=timeout, **kwargs)
