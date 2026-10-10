"""HTML → structured page model (text, links, forms, JSON-LD, meta)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import lxml.html
from lxml import etree

from .urlutil import canonicalize

BLOCK_TAGS = {
    "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td", "th", "section",
    "article", "header", "footer", "br", "table", "dd", "dt", "blockquote", "form", "label", "option",
}
DROP_TAGS = ("script", "style", "noscript", "svg", "template", "iframe", "canvas", "select")


@dataclass
class Link:
    url: str
    text: str
    context: str = ""
    in_nav: bool = False


@dataclass
class Form:
    action: str | None
    method: str
    n_inputs: int
    field_text: str


@dataclass
class Page:
    url: str
    title: str = ""
    h1: str = ""
    headings: list[str] = field(default_factory=list)
    og: dict = field(default_factory=dict)
    meta_description: str = ""
    lang: str = ""
    text: str = ""
    links: list[Link] = field(default_factory=list)
    forms: list[Form] = field(default_factory=list)
    jsonld: list[dict] = field(default_factory=list)
    iframes: list[str] = field(default_factory=list)


def _clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _flatten_jsonld(obj, out: list):
    if isinstance(obj, list):
        for o in obj:
            _flatten_jsonld(o, out)
    elif isinstance(obj, dict):
        if "@graph" in obj:
            _flatten_jsonld(obj["@graph"], out)
        if "@type" in obj:
            out.append(obj)


def parse_html(html: str | bytes, url: str) -> Page:
    page = Page(url=url)
    if not html:
        return page
    if isinstance(html, bytes):
        html = html.decode("utf-8", errors="replace")
    html = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", html)
    try:
        doc = lxml.html.document_fromstring(html)
    except (etree.ParserError, ValueError):
        return page

    page.lang = (doc.get("lang") or "").lower()

    # JSON-LD before dropping scripts
    for s in doc.xpath('//script[@type="application/ld+json"]'):
        raw = s.text_content() or ""
        try:
            data = json.loads(raw.strip().rstrip(";"))
        except Exception:
            continue
        _flatten_jsonld(data, page.jsonld)

    for m in doc.xpath("//meta[@property or @name]"):
        k = (m.get("property") or m.get("name") or "").lower()
        v = _clean(m.get("content"))
        if k.startswith("og:") and v:
            page.og[k[3:]] = v
        elif k == "description" and v:
            page.meta_description = v

    t = doc.find(".//title")
    page.title = _clean(t.text_content()) if t is not None else ""

    for fr in doc.xpath("//iframe[@src]"):
        c = canonicalize(fr.get("src"), url)
        if c:
            page.iframes.append(c)

    for bad in doc.xpath("|".join(f"//{t}" for t in DROP_TAGS)):
        bad.drop_tree()

    h1 = doc.xpath("//h1")
    page.h1 = _clean(h1[0].text_content()) if h1 else ""
    page.headings = [_clean(h.text_content())[:200] for h in doc.xpath("//h1|//h2|//h3")][:60]

    # Links (with nav detection and a little surrounding context)
    seen = set()
    for a in doc.xpath("//a[@href]"):
        href = a.get("href", "").strip()
        if href.startswith("mailto:"):
            txt = _clean(a.text_content())
            ctx = _clean((a.getparent().text_content() if a.getparent() is not None else ""))[:300]
            page.links.append(Link(url=href, text=txt[:200], context=ctx))
            continue
        c = canonicalize(href, url)
        if not c or c in seen:
            continue
        seen.add(c)
        txt = _clean(a.text_content()) or _clean(a.get("title")) or _clean(a.get("aria-label"))
        in_nav = bool(a.xpath("ancestor::nav|ancestor::header|ancestor::*[contains(@class,'menu') or contains(@class,'nav')]"))
        parent = a.getparent()
        ctx = _clean(parent.text_content())[:300] if parent is not None else ""
        page.links.append(Link(url=c, text=txt[:200], context=ctx, in_nav=in_nav))

    for f in doc.xpath("//form"):
        inputs = f.xpath(".//input[not(@type='hidden') and not(@type='submit')]|.//textarea|.//select")
        labels = " ".join(_clean(x.text_content()) for x in f.xpath(".//label|.//legend"))
        placeholders = " ".join(i.get("placeholder", "") or i.get("name", "") for i in f.xpath(".//input|.//textarea"))
        page.forms.append(Form(
            action=canonicalize(f.get("action") or url, url),
            method=(f.get("method") or "get").lower(),
            n_inputs=len(inputs),
            field_text=_clean(labels + " " + placeholders)[:600],
        ))

    # Navigation menus are captured as links above; keep them out of the prose text.
    for nav in doc.xpath("//nav"):
        nav.drop_tree()

    # Visible text with block boundaries preserved as newlines
    for el in doc.iter():
        if not isinstance(el.tag, str):
            continue
        if el.tag in BLOCK_TAGS:
            el.tail = "\n" + (el.tail or "")
            if el.tag == "br":
                continue
            el.text = "\n" + (el.text or "")
    raw = doc.text_content()
    lines = [_clean(l) for l in raw.split("\n")]
    page.text = "\n".join(l for l in lines if l)[:200_000]
    return page


def jsonld_events(page: Page) -> list[dict]:
    out = []
    for o in page.jsonld:
        t = o.get("@type")
        types = t if isinstance(t, list) else [t]
        if any(isinstance(x, str) and (x.endswith("Event") or x == "Festival") for x in types):
            out.append(o)
    return out
