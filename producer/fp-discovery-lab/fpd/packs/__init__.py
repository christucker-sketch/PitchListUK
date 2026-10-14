"""Language/country packs.

A pack adds one language's vocabulary to the shared, rule-based engine without changing how decisions are made:
the classifier still needs participation language + a route + currency + geography, and every decision still
quotes the page. Packs only *extend* the pattern lists in lexicon/state/dates/geo; they never remove English rules.

Each pack module exposes a ``PACK`` dict whose keys name the list or pattern it extends (see fr.py). Original-
language evidence is kept verbatim; nothing is translated.
"""
from __future__ import annotations

import re

from . import fr

PACKS = [fr.PACK]


def extra(key: str) -> list[str]:
    """All pack patterns for one extension point, in pack order."""
    out: list[str] = []
    for p in PACKS:
        out.extend(p.get(key, []))
    return out


def extend_re(base: re.Pattern, key: str, flags: int = re.I) -> re.Pattern:
    """Return base OR any pack pattern for `key` (base unchanged when no pack extends it)."""
    add = extra(key)
    if not add:
        return base
    return re.compile("(?:" + base.pattern + ")|" + "|".join(f"(?:{p})" for p in add), flags)


def extend_map(base: dict[str, str], key: str) -> dict[str, str]:
    """Merge {name: pattern} maps: an existing name gains an alternation, a new name is added."""
    out = dict(base)
    for p in PACKS:
        for k, v in p.get(key, {}).items():
            out[k] = f"(?:{out[k]})|(?:{v})" if k in out else v
    return out
