"""Polite async fetcher: robots.txt, per-host rate limiting, size caps, raw-content cache."""
from __future__ import annotations

import asyncio
import gzip
import hashlib
import os
import time
from dataclasses import dataclass
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlsplit

import httpx

from .config import Config


@dataclass
class FetchResult:
    url: str
    final_url: str | None = None
    status: int | None = None
    content_type: str = ""
    body: bytes = b""
    elapsed_ms: int = 0
    error: str | None = None
    robots_blocked: bool = False
    from_cache: bool = False

    @property
    def ok(self) -> bool:
        return self.error is None and self.status is not None and 200 <= self.status < 300

    def text(self) -> str:
        enc = "utf-8"
        ct = self.content_type.lower()
        if "charset=" in ct:
            enc = ct.split("charset=")[-1].split(";")[0].strip() or "utf-8"
        try:
            return self.body.decode(enc, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


class Fetcher:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.client = httpx.AsyncClient(
            headers={
                "User-Agent": cfg.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
                "Accept-Language": "en-GB,en;q=0.9",
            },
            follow_redirects=True,
            timeout=httpx.Timeout(cfg.timeout, connect=10),
            limits=httpx.Limits(max_connections=cfg.concurrency * 2, max_keepalive_connections=cfg.concurrency),
            http2=False,
            verify=os.environ.get("SSL_CERT_FILE") or True,
        )
        self.robots: dict[str, robotparser.RobotFileParser | None] = {}
        self.robots_locks: dict[str, asyncio.Lock] = {}
        self.host_next: dict[str, float] = {}
        self.host_locks: dict[str, asyncio.Lock] = {}
        self.host_failures: dict[str, int] = {}
        self.lenient_hosts: set[str] = set()
        self.cache_dir = Path(cfg.data_dir) / "cache"

    async def close(self):
        await self.client.aclose()

    # ---------- politeness ----------
    def _delay_for(self, host: str) -> float:
        return self.cfg.host_delay_overrides.get(host, self.cfg.host_delay)

    async def _wait_turn(self, host: str):
        lock = self.host_locks.setdefault(host, asyncio.Lock())
        async with lock:
            now = time.monotonic()
            nxt = self.host_next.get(host, 0)
            if nxt > now:
                await asyncio.sleep(nxt - now)
            self.host_next[host] = time.monotonic() + self._delay_for(host)

    def host_ready_in(self, host: str) -> float:
        return max(0.0, self.host_next.get(host, 0) - time.monotonic())

    async def allowed(self, url: str) -> bool:
        sp = urlsplit(url)
        key = f"{sp.scheme}://{sp.netloc}"
        if key not in self.robots:
            lock = self.robots_locks.setdefault(key, asyncio.Lock())
            async with lock:
                if key not in self.robots:
                    rp = robotparser.RobotFileParser()
                    try:
                        await self._wait_turn(sp.netloc)
                        try:
                            r = await self.client.get(key + "/robots.txt", timeout=12)
                            status, text = r.status_code, r.text
                        except (httpx.RemoteProtocolError, httpx.LocalProtocolError):
                            # malformed response headers (h11 is strict): read robots.txt with the lenient stdlib client
                            self.lenient_hosts.add(sp.netloc)
                            fb = await asyncio.get_running_loop().run_in_executor(None, self._stdlib_get, key + "/robots.txt", 512_000)
                            if fb is None:
                                raise
                            status, text = fb.status or 0, fb.text()
                        if status in (401, 403):
                            rp.disallow_all = True
                        elif status >= 400:
                            rp.allow_all = True
                        else:
                            rp.parse(text.splitlines())
                    except Exception:
                        rp.allow_all = True  # unreachable robots: treat as no rules (RFC 9309 §2.3.1.3 for 4xx)
                    self.robots[key] = rp
        rp = self.robots[key]
        try:
            return rp.can_fetch(self.cfg.robots_agent, url)
        except Exception:
            return True

    def sitemaps_from_robots(self, url: str) -> list[str]:
        sp = urlsplit(url)
        rp = self.robots.get(f"{sp.scheme}://{sp.netloc}")
        try:
            return list(rp.site_maps() or []) if rp else []
        except Exception:
            return []

    # ---------- fetch ----------
    async def get(self, url: str, check_robots: bool = True, max_bytes: int | None = None) -> FetchResult:
        res = FetchResult(url=url)
        host = urlsplit(url).netloc
        if self.host_failures.get(host, 0) >= self.cfg.host_failure_limit:
            res.error = "host_circuit_open"
            return res
        if check_robots and not await self.allowed(url):
            res.robots_blocked = True
            res.error = "robots_disallowed"
            return res
        await self._wait_turn(host)
        t0 = time.monotonic()
        cap = max_bytes or self.cfg.max_bytes
        if host in self.lenient_hosts:
            fb = await asyncio.get_running_loop().run_in_executor(None, self._stdlib_get, url, cap)
            if fb is not None:
                fb.elapsed_ms = int((time.monotonic() - t0) * 1000)
                self.host_failures[host] = 0
                return fb
            res.error = "stdlib_fetch_failed"
            self.host_failures[host] = self.host_failures.get(host, 0) + 1
            return res
        try:
            async with self.client.stream("GET", url) as r:
                res.status = r.status_code
                res.final_url = str(r.url)
                res.content_type = r.headers.get("content-type", "")
                ct = res.content_type.lower()
                if r.status_code < 300 and not any(x in ct for x in ("html", "xml", "json", "text/plain")) and ct:
                    res.error = f"skipped_content_type:{ct.split(';')[0]}"
                else:
                    chunks, size = [], 0
                    async for chunk in r.aiter_bytes():
                        chunks.append(chunk)
                        size += len(chunk)
                        if size > cap:
                            break
                    res.body = b"".join(chunks)[:cap]
            if res.status and res.status >= 400:
                res.error = f"http_{res.status}"
            self.host_failures[host] = 0 if res.ok else self.host_failures.get(host, 0) + (1 if (res.status or 0) >= 500 else 0)
        except httpx.TimeoutException:
            res.error = "timeout"
            self.host_failures[host] = self.host_failures.get(host, 0) + 1
        except httpx.HTTPError as e:
            if "illegal header" in str(e).lower() or isinstance(e, (httpx.RemoteProtocolError, httpx.LocalProtocolError)):
                # Some servers send malformed headers that h11 rejects; the stdlib client is lenient.
                self.lenient_hosts.add(host)
                fb = await asyncio.get_running_loop().run_in_executor(None, self._stdlib_get, url, cap)
                if fb is not None:
                    fb.elapsed_ms = int((time.monotonic() - t0) * 1000)
                    return fb
            res.error = f"{type(e).__name__}: {str(e)[:160]}"
            self.host_failures[host] = self.host_failures.get(host, 0) + 1
        except Exception as e:  # noqa: BLE001
            res.error = f"{type(e).__name__}: {str(e)[:160]}"
        res.elapsed_ms = int((time.monotonic() - t0) * 1000)
        return res

    def _stdlib_get(self, url: str, cap: int):
        import urllib.error
        import urllib.request
        try:
            req = urllib.request.Request(url, headers={"User-Agent": self.cfg.user_agent})
            with urllib.request.urlopen(req, timeout=15) as r:
                res = FetchResult(url=url, final_url=r.geturl(), status=r.status,
                                  content_type=r.headers.get("content-type", "text/html").replace(":", ";"),
                                  body=r.read(cap))
                return res
        except urllib.error.HTTPError as e:
            return FetchResult(url=url, final_url=url, status=e.code, error=f"http_{e.code}")
        except Exception:  # noqa: BLE001
            return None

    def cache_put(self, body: bytes) -> tuple[str, str]:
        h = hashlib.sha256(body).hexdigest()
        p = self.cache_dir / h[:2] / f"{h}.gz"
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            with gzip.open(p, "wb", compresslevel=5) as f:
                f.write(body)
        return h, str(p.relative_to(self.cfg.data_dir))
