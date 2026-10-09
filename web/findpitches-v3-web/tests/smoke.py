"""Browser smoke test of the V3 site against the dev stub (no other system involved).
   python3 tests/smoke.py [base_url]   (start the stub first: node dev/stub-server.mjs)"""
import sys, json, re, os
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790"
results, problems = [], []

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    if not cond: problems.append(f"{name}: {detail}")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('FP_BROWSER_EXECUTABLE'))
    ctx = b.new_context()
    page = ctx.new_page()
    errors, foreign = [], []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda r: foreign.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith("data:") else None)

    def visit(path, wait_for, name):
        errors.clear()
        page.goto(BASE + path)
        try:
            page.wait_for_selector(wait_for, timeout=15000)
            ok = True
        except Exception as e:
            ok = False
        check(name, ok and not errors, f"selector {wait_for}; console errors: {errors[:3]}")

    visit("/index.html", "header .logo, header a", "home renders")
    check("home: no 'temporarily unavailable'", "temporarily unavailable" not in page.content())
    visit("/finder.html?cc=uk", "#results a, .card, [data-save]", "finder GB renders results")
    txt = page.inner_text("body")
    check("finder GB shows enquiry/open statuses", re.search(r"Contact organiser|Taking applications|Apply any time|Apply by|Closes", txt), "no status chip text found")
    check("finder GB has no V2 'Showing N listings… there may be more' text", "there may be more" not in txt)
    visit("/finder.html?cc=us", "#results a, .card, [data-save]", "finder US renders results")
    oid = json.loads(page.evaluate("fetch('/api/v3/opportunities?market=GB&page_size=1').then(r=>r.text())"))["results"][0]["id"]
    visit(f"/opportunity.html?id={oid}", "h1", "opportunity page renders")
    check("opportunity: canonical uses fdx1 id", page.evaluate("document.querySelector('link[rel=canonical]')?.href||''").endswith(f"/uk/opportunity/{oid}/"))
    visit("/seo.html?path=/uk/", "h1", "SEO market hub /uk/ renders")
    check("SEO hub not 'coming soon'", "coming soon" not in page.inner_text("h1").lower())
    check("SEO hub sets robots meta", page.evaluate("document.querySelector('meta[name=robots]')?.content") in ("index,follow", "noindex,follow"))
    visit("/seo.html?path=/uk/christmas-market-stalls/", "h1", "SEO intent page renders")
    visit("/seo.html?path=/uk/kent/", "h1", "SEO region page renders")
    visit("/pricing.html", ".plan", "pricing renders plans")
    visit("/saved.html", "main", "saved renders (signed out)")
    visit("/alerts.html", "main", "alerts renders (signed out)")
    visit("/organisers.html", "form, main", "organisers renders")
    # sign in through the stub's dev link, then save a listing
    page.goto(BASE + "/account.html")
    page.wait_for_timeout(800)
    r = page.evaluate("""async()=>{ await fetch('/api/v3/session'); const c=document.cookie.match(/fp_csrf=([^;]+)/)[1];
        const l=await (await fetch('/api/v3/session/link',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':c},body:JSON.stringify({email:'smoke@example.com',next:'/account.html'})})).json();
        await fetch(l.dev_link,{redirect:'manual'}); const s=await (await fetch('/api/v3/session')).json();
        const sv=await (await fetch('/api/v3/saved',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':c},body:JSON.stringify({id:'%s'})})).json();
        const ids=await (await fetch('/api/v3/saved')).json(); return {signed:s.signed_in, ids:ids.ids}; }""" % oid)
    check("sign-in via dev link + save", r["signed"] and oid in r["ids"], str(r))
    visit("/saved.html", ".card, [data-save], main h1", "saved page lists the saved listing")
    check("browser made no request to any other origin", not foreign, str(foreign[:5]))
    b.close()

for n, ok, d in results:
    print(("PASS " if ok else "FAIL ") + n + ("" if ok else f"  -> {d}"))
print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed")
sys.exit(1 if problems else 0)
