"""Date mention extraction tuned for event/vendor pages.

Returns dates with character offsets so callers can look at the surrounding text
(e.g. 'deadline', 'applications close') to decide what a date *means*.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9,
    "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
M = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
D = r"(\d{1,2})(?:st|nd|rd|th)?"
SEP = r"\s*(?:-|–|—|&|and|to|through|thru|\+|/)\s*"
WD = r"(?:(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s+)?"
Y = r"(20\d{2})"

# 19-20 September 2026 / Saturday 5th & Sunday 6th December 2026 / 5 Dec
RE_DMY = re.compile(rf"\b{WD}{D}(?:{SEP}{WD}{D})?\s+(?:of\s+)?{M}(?:,?\s+{Y})?\b", re.I)
# September 19-20, 2026 / Sept 19 – Oct 2, 2026 / Dec 5
RE_MDY = re.compile(rf"\b{WD}{M}\s+{D}(?:{SEP}(?:{M}\s+)?{D})?(?:,?\s+{Y})?\b", re.I)
RE_ISO = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
RE_NUM = re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|\d{2})\b")
RE_YEAR = re.compile(r"\b(20[12]\d)\b")

# French (fr pack): "samedi 5 et dimanche 6 décembre 2026", "du 5 au 7 décembre", "1er décembre", "les 12 et 13 déc."
from .packs.fr import MONTH_FR_RE, MONTHS_FR, WEEKDAY_FR  # noqa: E402

_D_FR = r"(\d{1,2})(?:er|e|è|ème|eme)?"
_WD_FR = rf"(?:{WEEKDAY_FR}\s+)?"
# "les 13, 14 et 15 novembre 2026" (21 Oct, Angers): a comma list of days before the last one; the middle days are
# skipped, the range is first..last.
RE_FR = re.compile(rf"\b{_WD_FR}{_D_FR}(?:\s*,\s*{_WD_FR}\d{{1,2}}(?:er|e|è|ème|eme)?(?=\s*(?:,|et|&)))*"
                   rf"(?:\s*(?:au|et|-|–|—|&|à)\s*{_WD_FR}{_D_FR})?\s+{MONTH_FR_RE}(?:\s+{Y})?(?![\w])", re.I)
_WEEKDAYS_FR = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6}


def _weekday_year(raw: str, mo: int, day: str, today: dt.date) -> int | None:
    """Year for a yearless French date that names its weekday ("vendredi 30 octobre"): the one year in
    today.year-1 .. today.year+1 where that day falls on that weekday. A date names its weekday on a page about
    one particular edition, so this is the source's own statement, not a guess. None if no unique fit."""
    m = re.match(r"\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b", raw, re.I)
    if not m:
        return None
    want = _WEEKDAYS_FR[m.group(1).lower()]
    fits = [y for y in (today.year - 1, today.year, today.year + 1) if (d := _mk(y, mo, day)) and d.weekday() == want]
    return fits[0] if len(fits) == 1 else None


@dataclass
class DateMention:
    start: dt.date
    end: dt.date | None
    pos: int
    endpos: int
    has_year: bool
    raw: str


def _month(s: str) -> int | None:
    s = s.lower().rstrip(".")
    return MONTHS.get(s) or MONTHS_FR.get(s) or MONTHS_FR.get(s.replace("é", "e").replace("û", "u")) or MONTHS.get(s[:3])


def _mk(y, m, d):
    try:
        return dt.date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None


def _infer_year(text: str, pos: int, today: dt.date, win: int = 250) -> int | None:
    # Nearest explicit year within `win` chars (prefer before), else None.
    window = text[max(0, pos - win): pos + win]
    # English path keeps its historical distance reference (250 into the window) so existing classifications do not
    # move; the French path measures from the actual date position.
    off = 250 if win == 250 else pos - max(0, pos - win)
    ys = [(abs(m.start() - off), int(m.group(1))) for m in RE_YEAR.finditer(window)]
    if ys:
        return sorted(ys)[0][1]
    return None


def extract_dates(text: str, today: dt.date, day_first: bool = True) -> list[DateMention]:
    out: list[DateMention] = []
    taken: list[tuple[int, int]] = []

    def overlaps(a, b):
        return any(not (b <= s or a >= e) for s, e in taken)

    for m in RE_ISO.finditer(text):
        d = _mk(m.group(1), m.group(2), m.group(3))
        if d:
            out.append(DateMention(d, None, m.start(), m.end(), True, m.group(0)))
            taken.append((m.start(), m.end()))

    for m in RE_FR.finditer(text):
        d1, d2, mon, yr = m.group(1), m.group(2), m.group(3), m.group(4)
        mo = _month(mon)
        has_year = bool(yr)
        # French announcements put the edition year in a nearby sentence ("Rejoignez l'édition 2026"): wider window.
        y = int(yr) if yr else _infer_year(text, m.start(), today, win=400)
        if not y and mo:
            y = _weekday_year(m.group(0), mo, d1, today)
        if not y or not mo:
            continue
        s = _mk(y, mo, d1)
        e = _mk(y, mo, d2) if d2 else None
        if s:
            out.append(DateMention(s, e if e and e >= s else None, m.start(), m.end(), has_year, m.group(0)))
            taken.append((m.start(), m.end()))

    for m in RE_DMY.finditer(text):
        if overlaps(m.start(), m.end()):
            continue
        d1, d2, mon, yr = m.group(1), m.group(2), m.group(3), m.group(4)
        mo = _month(mon)
        has_year = bool(yr)
        y = int(yr) if yr else _infer_year(text, m.start(), today)
        if not y or not mo:
            continue
        s = _mk(y, mo, d1)
        e = _mk(y, mo, d2) if d2 else None
        if s:
            out.append(DateMention(s, e if e and e >= s else None, m.start(), m.end(), has_year, m.group(0)))
            taken.append((m.start(), m.end()))

    for m in RE_MDY.finditer(text):
        if overlaps(m.start(), m.end()):
            continue
        mon, d1, mon2, d2, yr = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        mo = _month(mon)
        mo2 = _month(mon2) if mon2 else mo
        has_year = bool(yr)
        y = int(yr) if yr else _infer_year(text, m.start(), today)
        if not y or not mo:
            continue
        s = _mk(y, mo, d1)
        e = _mk(y, mo2, d2) if d2 else None
        if s:
            out.append(DateMention(s, e if e and e >= s else None, m.start(), m.end(), has_year, m.group(0)))
            taken.append((m.start(), m.end()))

    for m in RE_NUM.finditer(text):
        if overlaps(m.start(), m.end()):
            continue
        a, b, y = int(m.group(1)), int(m.group(2)), m.group(3)
        y = int(y) if len(y) == 4 else 2000 + int(y)
        if a > 12:
            d, mo = a, b
        elif b > 12:
            d, mo = b, a
        else:
            d, mo = (a, b) if day_first else (b, a)
        s = _mk(y, mo, d)
        if s:
            out.append(DateMention(s, None, m.start(), m.end(), True, m.group(0)))
            taken.append((m.start(), m.end()))

    # Join "30 May - 1 June 2026" style ranges: two adjacent mentions separated by a dash.
    out.sort(key=lambda x: x.pos)
    merged: list[DateMention] = []
    for dm in out:
        if merged:
            prev = merged[-1]
            gap = text[prev.endpos: dm.pos]
            if prev.end is None and re.fullmatch(r"\s*(?:-|–|—|to|until|through|thru|au|jusqu['’]au)\s*", gap or "", re.I) \
                    and dm.start >= prev.start and (dm.start - prev.start).days <= 45:
                if not prev.has_year and dm.has_year and prev.start.year != dm.start.year:
                    prev.start = _mk(dm.start.year, prev.start.month, prev.start.day) or prev.start
                prev.end = dm.start
                prev.has_year = prev.has_year or dm.has_year
                prev.endpos = dm.endpos
                prev.raw = text[prev.pos: dm.endpos]
                continue
        merged.append(dm)
    # Sanity window: ignore dates wildly outside the plausible range.
    lo, hi = dt.date(today.year - 6, 1, 1), dt.date(today.year + 3, 12, 31)
    return [d for d in merged if lo <= d.start <= hi]


def parse_iso(s: str | None) -> dt.date | None:
    if not s or not isinstance(s, str):
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s.strip())
    return _mk(*m.groups()) if m else None


NON_EVENT_YEAR = re.compile(
    r"(?:©|\(c\)|copyright|act|regulations?|code|standards?|since|est\.?|established|founded(?:\s+in)?|"
    r"files/|uploads/|/)\s*(?:\d{4}\s*[-–]\s*)?$", re.I)


def year_counts(text: str) -> dict[int, int]:
    """Count year mentions, ignoring ones that are not about event timing (copyright, laws, URLs...)."""
    c: dict[int, int] = {}
    for m in RE_YEAR.finditer(text):
        if NON_EVENT_YEAR.search(text[max(0, m.start() - 25): m.start()]):
            continue
        y = int(m.group(1))
        c[y] = c.get(y, 0) + 1
    return c
