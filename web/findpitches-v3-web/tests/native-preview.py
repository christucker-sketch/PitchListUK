"""Browser checks against the restricted, deployed V3 API, with real READY data.
Access cookies come from verify-customer-preview.mjs's PRIVATE output, never chat.
python tests/native-preview.py /path/to/browser-access-private.json
"""
import json, os, sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

access = json.load(open(sys.argv[1]))
base, results, errors, foreign = access['base'], [], [], []
def check(name, passed):
    results.append({'check': name, 'passed': bool(passed)})
    print(('PASS ' if passed else 'FAIL ') + name)

proxy_url = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
proxy = None
if proxy_url and urlsplit(base).hostname not in ['localhost', '127.0.0.1']:
    u = urlsplit(proxy_url)
    proxy = {'server': f'{u.scheme}://{u.hostname}:{u.port}'}
    if u.username: proxy['username'] = u.username
    if u.password: proxy['password'] = u.password
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('FP_BROWSER_EXECUTABLE', '/usr/bin/chromium'), proxy=proxy)
    ctx = browser.new_context()
    ctx.add_cookies(access['cookies'])
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: foreign.append(r.url) if not r.url.startswith(base + '/') and not r.url.startswith('data:') else None)
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base + '/') or route.request.url.startswith('data:') else route.abort())
    def visit(path, selector, name):
        errors.clear()
        r = page.goto(base + path)
        try:
            page.wait_for_selector(selector, timeout=30000)
            ok = True
        except Exception:
            ok = False
        check(name, r.status == 200 and ok and not errors)
        if not (r.status == 200 and ok and not errors):
            print(json.dumps({'path': path, 'status': r.status, 'selector_found': ok, 'page_errors': errors, 'results_message': page.locator('#list').inner_text()[:400] if page.locator('#list').count() else None}))
    visit('/', 'header a', 'owned Build 4 homepage')
    check('truthful approved source wording', 'Never other people' not in page.content() and 'Checked against event, organiser and application sources.' in page.content())
    visit('/uk/find-pitches/', '#list .ocard h3 a', 'clean UK full Finder with real results')
    check('UK route selects GB', page.evaluate("FP.state.market === 'GB'"))
    check('radius disabled without geocoded proof', page.evaluate("!FP.state.m().search.radius"))
    r = page.evaluate("fetch('/api/v3/opportunities?market=GB&page_size=2').then(r=>r.json())")
    oid = r['results'][0]['id']
    check('V3 entity IDs, no fixture IDs', oid.startswith('ent_'))
    visit('/uk/opportunity/' + oid + '/', 'h1', 'clean real opportunity detail')
    check('subscribed application URL', page.evaluate("[...document.querySelectorAll('[data-apply]')].some(a => a.href.startsWith('https://'))"))
    check('server-rendered canonical', page.evaluate("document.querySelector('link[rel=canonical]').href").endswith('/uk/opportunity/' + oid + '/'))
    visit('/us/find-pitches/', '#list .ocard h3 a', 'clean US Finder')
    check('US route selects US', page.evaluate("FP.state.market === 'US'"))
    us = page.evaluate("fetch('/api/v3/opportunities?market=US&page_size=1').then(r=>r.json())")
    check('GB entitlement cannot unlock US', us['results'][0]['access']['locked'])
    visit('/uk/', 'h1', 'server-routed SEO hub')
    check('shadow noindex', page.evaluate("document.querySelector('meta[name=robots]').content") == 'noindex,nofollow')
    visit('/pricing/', '.plan', 'native pricing')
    visit('/saved.html', 'main', 'saved page')
    visit('/alerts.html', 'main', 'alerts page')
    visit('/account.html', 'main', 'native account page')
    visit('/organisers/', 'form, main', 'organiser forms')
    empty = page.evaluate("fetch('/api/v3/opportunities?market=GB&q_text=impossible-fp-query-000000').then(r=>r.json())")
    check('honest empty search', empty['total'] == 0 and empty['results'] == [])
    paging = page.evaluate("Promise.all([1,2].map(page=>fetch('/api/v3/opportunities?market=GB&page_size=2&page='+page).then(r=>r.json())))")
    check('stable distinct pagination', not set(x['id'] for x in paging[0]['results']).intersection(x['id'] for x in paging[1]['results']))
    check('bundled fonts', page.evaluate("document.fonts.status === 'loaded'"))
    check('zero legacy or third-party browser requests', not foreign)
    browser.close()
report = {'passed': sum(r['passed'] for r in results), 'total': len(results), 'results': results, 'foreign_requests': len(foreign)}
if len(sys.argv) > 2: json.dump(report, open(sys.argv[2], 'w'), indent=2)
print(f"{report['passed']}/{report['total']} passed")
sys.exit(0 if report['passed'] == report['total'] else 1)
