"""Configuration from environment variables (optionally loaded from a local .env file).

Secrets (API keys) are only ever read from the environment — never written to the DB or logs.
"""
from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


@dataclass
class Config:
    data_dir: Path
    db_path: Path
    snapshot_path: Path | None
    user_agent: str
    robots_agent: str = "FPDiscoveryLab"
    concurrency: int = 16
    host_delay: float = 2.0
    host_delay_overrides: dict = field(default_factory=dict)
    timeout: float = 20.0
    max_bytes: int = 2_500_000
    host_failure_limit: int = 4
    site_page_budget: int = 8          # max pages fetched per organiser site during exploration
    max_depth: int = 3
    countries: tuple = ("GB", "US", "CA", "AU", "NZ", "IE")
    brave_api_key: str | None = None
    today: dt.date = field(default_factory=dt.date.today)

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv(PROJECT_DIR / ".env")
        data_dir = Path(os.environ.get("FPD_DATA_DIR", PROJECT_DIR / "data")).expanduser()
        db = Path(os.environ.get("FPD_DB", data_dir / "fpd.sqlite")).expanduser()
        snap = os.environ.get("FPD_SNAPSHOT")
        contact = os.environ.get("FPD_CONTACT", "")
        ua = f"FPDiscoveryLab/0.1 (+research prototype; respects robots.txt{'; ' + contact if contact else ''})"
        today = os.environ.get("FPD_TODAY")
        return cls(
            data_dir=data_dir,
            db_path=db,
            snapshot_path=Path(snap).expanduser() if snap else None,
            user_agent=ua,
            concurrency=int(os.environ.get("FPD_CONCURRENCY", 16)),
            host_delay=float(os.environ.get("FPD_HOST_DELAY", 2.0)),
            host_delay_overrides={
                # Large platforms tolerate a slightly faster (still conservative) pace.
                "www.eventeny.com": 1.0, "marketspread.com": 1.5, "www.zapplication.org": 1.5,
                "query.wikidata.org": 1.0, "overpass-api.de": 5.0,
                "localstalls.com": 1.0, "cluemart.co.nz": 1.2, "www.ukcraftfairs.com": 1.0, "app.entrythingy.com": 1.2,
            },
            site_page_budget=int(os.environ.get("FPD_SITE_BUDGET", 8)),
            brave_api_key=os.environ.get("BRAVE_API_KEY") or None,
            today=dt.date.fromisoformat(today) if today else dt.date.today(),
        )
