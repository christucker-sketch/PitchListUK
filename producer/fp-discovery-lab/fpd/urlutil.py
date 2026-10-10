"""URL canonicalisation and domain helpers."""
from __future__ import annotations

import re
from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import tldextract

# Offline public-suffix list (bundled snapshot) — no network call at import time.
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)

TRACKING_PARAMS = re.compile(
    r"^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl|ref|ref_src|igshid|si|s_kwcid|hsCtaTracking|_hs\w+|occurrence|srsltid|gad_source|gbraid|wbraid|yclid|mkt_tok|"
    r"_kx|trk|campaign|cmpid|share|sharer|fbclid)$",
    re.I,
)

SKIP_EXT = re.compile(
    r"\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?|mp4|mov|avi|mkv|webm|mp3|wav|ogg|zip|rar|7z|gz|tgz|exe|dmg|"
    r"css|js|json|woff2?|ttf|eot|ics|xlsx?|pptx?|csv)(\?|$)",
    re.I,
)

SOCIAL_HOSTS = (
    "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be",
    "linkedin.com", "pinterest.com", "threads.net", "wa.me", "whatsapp.com", "t.me", "snapchat.com",
    "flickr.com", "vimeo.com", "spotify.com", "soundcloud.com", "apple.com", "google.com/maps",
    "maps.google", "goo.gl/maps", "tripadvisor", "bsky.app",
)


def canonicalize(url: str, base: str | None = None) -> str | None:
    try:
        return _canonicalize(url, base)
    except (ValueError, TypeError):
        return None


def _canonicalize(url: str, base: str | None = None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if base:
        url = urljoin(base, url)
    try:
        sp = urlsplit(url)
    except ValueError:
        return None
    if sp.scheme not in ("http", "https"):
        return None
    host = (sp.hostname or "").lower().rstrip(".")
    if not host or "." not in host:
        return None
    port = f":{sp.port}" if sp.port and sp.port not in (80, 443) else ""
    path = re.sub(r"/{2,}", "/", sp.path or "/")
    if path != "/" and path.endswith("/") and not _keep_trailing_slash(host):
        path = path.rstrip("/")
    q = [(k, v) for k, v in parse_qsl(sp.query, keep_blank_values=True) if not TRACKING_PARAMS.match(k)]
    q.sort()
    query = urlencode(q, doseq=True)
    return urlunsplit((sp.scheme.lower(), host + port, path, query, ""))


def _keep_trailing_slash(host: str) -> bool:
    # Some platforms route differently with/without slash; keep as-is for them.
    return any(h in host for h in ("eventeny.com", "marketspread.com"))


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


@lru_cache(maxsize=100_000)
def split_host(host: str):
    ext = _EXTRACT(host)
    return ext


def reg_domain(url_or_host: str) -> str:
    host = host_of(url_or_host) if "://" in url_or_host else url_or_host.lower()
    ext = split_host(host)
    if ext.domain and ext.suffix:
        return f"{ext.domain}.{ext.suffix}"
    return host


def suffix(url_or_host: str) -> str:
    host = host_of(url_or_host) if "://" in url_or_host else url_or_host.lower()
    return split_host(host).suffix


def is_social(url: str) -> bool:
    u = url.lower()
    return any(s in u for s in SOCIAL_HOSTS)


def should_skip(url: str) -> bool:
    return bool(SKIP_EXT.search(urlsplit(url).path)) or url.startswith("mailto:")
