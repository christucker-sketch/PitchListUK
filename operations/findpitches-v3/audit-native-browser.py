"""Bounded private-preview browser reads using a retained ended TEST account.

No emails, Checkout, provider writes, alerts or profile edits. TLS validation
uses the existing exact-host CA in the dedicated isolated profile.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright


def audit(session_file, report_file):
    private = Path('/workspace/.pitchlist-cloud/v3-customer-preview')
    if Path(session_file).resolve() != private / 'operational-session-private.json':
        raise ValueError('private_operational_session_required')
    if Path(report_file).resolve() != private / 'operational-browser-report.json':
        raise ValueError('private_operational_report_required')
    s = json.loads(Path(session_file).read_text())
    origin = 'https://findpitches-v3-customer-preview.ctucker.workers.dev'
    if s['origin'] != origin or not s['dev_link'].startswith(origin + '/api/v3/session/verify?'):
        raise ValueError('native_synthetic_challenge_required')
    proxy = None
    raw_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
    if raw_proxy:
        u = urlsplit(raw_proxy)
        proxy = {'server': f'{u.scheme}://{u.hostname}:{u.port}'}
        if u.username: proxy['username'] = u.username
        if u.password: proxy['password'] = u.password
    checks, timings, errors, foreign, blocked, requests = [], [], [], [], [], []
    progress_file = private / 'operational-browser-progress.json'
    def progress(stage):
        progress_file.write_text(json.dumps({'stage': stage, 'checks': checks, 'requests': len(requests), 'foreign_requests': len(foreign), 'foreign_hosts': sorted(set(foreign))})); progress_file.chmod(0o600)
    def check(name, passed):
        checks.append({'check': name, 'passed': bool(passed)})
        progress(name)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context('/workspace/.pitchlist-cloud/v3-browser-trust-isolated', executable_path='/usr/bin/chromium', proxy=proxy, viewport={'width': 1280, 'height': 900})
        try:
            for old_page in ctx.pages:
                old_page.close()
            ctx.clear_cookies()
            def route(r):
                requests.append(urlsplit(r.request.url).path)
                if len(requests) > 250:
                    blocked.append('request_budget'); r.abort()
                elif not r.request.url.startswith(origin + '/') and not r.request.url.startswith('data:'):
                    foreign.append(urlsplit(r.request.url).hostname); r.abort()
                else: r.continue_()
            ctx.route('**/*', route)
            page = ctx.new_page()
            page.on('pageerror', lambda _: errors.append('page_script_error'))
            def visit(path, selector, name):
                progress('visiting_' + name)
                errors.clear()
                started = datetime.datetime.now(datetime.timezone.utc)
                r = page.goto(origin + path, wait_until='domcontentloaded', timeout=60000)
                found = True
                try: page.wait_for_selector(selector, timeout=30000)
                except Exception: found = False
                timings.append({'route': path, 'status': r.status, 'interactive_ms': round((datetime.datetime.now(datetime.timezone.utc) - started).total_seconds() * 1000)})
                check(name, r.status == 200 and found and not errors)
                if not found:
                    (private / 'operational-browser-failure-private.html').write_text(page.content())
            progress('consuming_native_challenge')
            page.goto(s['dev_link'], wait_until='domcontentloaded', timeout=60000)
            session = page.evaluate("fetch('/api/v3/session').then(r=>r.json()).then(s=>({signed_in:s.signed_in,tier:s.access.tier}))")
            check('native_signin_retained_ended_fixture', session['signed_in'] and session['tier'] == 'free')
            cookies = [c for c in ctx.cookies(origin) if c['name'].startswith('__Host-')]
            check('secure_host_session_cookies', len(cookies) >= 2 and all(c['secure'] and c['httpOnly'] and c['path'] == '/' and c['sameSite'] == 'Lax' for c in cookies))
            visit('/', 'header a', 'homepage_browser')
            check('approved_source_wording', 'Checked against event, organiser and application sources.' in page.content())
            visit('/uk/find-pitches/', '#list .ocard h3 a', 'GB_finder_browser')
            page.set_viewport_size({'width': 390, 'height': 844})
            check('mobile_finder_browser', page.locator('#list .ocard h3 a').count() > 0 and not errors)
            check('mobile_no_page_horizontal_overflow', page.evaluate("document.documentElement.scrollWidth <= innerWidth+1"))
            page.set_viewport_size({'width': 1280, 'height': 900})
            check('GB_route_country_and_radius', page.evaluate("FP.state.market==='GB'&&!FP.state.m().search.radius") and page.locator('#radiusF').count() == 0)
            check('nearest_control_disabled', page.locator('#sort option[value=nearest]').is_disabled())
            gb = page.evaluate("fetch('/api/v3/opportunities?market=GB&page_size=1').then(r=>r.json())")
            check('All_types_includes_unclassified', str(gb['total']) == page.locator('#chips button[data-t=""] small').inner_text())
            oid = gb['results'][0]['id']
            check('ended_api_redaction', gb['results'][0]['access']['locked'] and gb['results'][0]['access']['application_url'] is None and gb['results'][0]['access']['source_url'] is None)
            visit('/uk/opportunity/' + oid + '/', 'h1', 'opportunity_detail_browser')
            check('ended_DOM_redaction', page.evaluate("![...document.querySelectorAll('[data-apply]')].some(a=>a.href.startsWith('https://'))"))
            visit('/uk/find-pitches/?q=Cambridge', '#list .zero, #list .ocard', 'literal_place_browser')
            check('literal_place_heading_truthful', 'cambridge' in page.locator('#h1').inner_text().lower() and 'cambridge' in page.locator('#lochint').inner_text().lower())
            visit('/uk/find-pitches/?q=fp-never-a-location-000000', '#list .zero', 'unresolved_empty_browser')
            check('unresolved_does_not_claim_all_country', 'all of' not in page.locator('#lochint').inner_text().lower())
            visit('/us/find-pitches/', '#list .ocard h3 a', 'US_finder_browser')
            check('US_route_country', page.evaluate("FP.state.market==='US'"))
            us = page.evaluate("fetch('/api/v3/opportunities?market=US&page_size=1').then(r=>r.json())")
            check('US_ended_redaction', all(o['access']['locked'] and not o['access']['application_url'] and not o['access']['source_url'] for o in us['results']))
            visit('/uk/', 'h1', 'SEO_hub_browser')
            check('HTML_noindex', page.evaluate("document.querySelector('meta[name=robots]').content") == 'noindex,nofollow')
            for path, selector, name in [('/pricing/', '.plan', 'pricing_browser'), ('/account.html', 'main', 'account_browser'), ('/saved.html', 'main', 'saved_browser'), ('/alerts.html', 'main', 'alerts_browser')]:
                visit(path, selector, name)
            check('ended_no_second_trial_offer', 'Try Pro free for 7 days' not in page.content())
            page.evaluate('document.fonts.ready')
            check('local_fonts_loaded', page.evaluate("document.fonts.status==='loaded'"))
            check('zero_foreign_browser_requests', not foreign)
            check('browser_request_budget', not blocked)
            report = {'schema': 'findpitches-v3-native-browser-audit-v1', 'as_of': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'browser': ctx.browser.version, 'origin': origin, 'checks': checks, 'passed': sum(c['passed'] for c in checks), 'total': len(checks), 'issues': [c['check'] for c in checks if not c['passed']], 'timings': timings, 'browser_requests': len(requests), 'foreign_requests': len(foreign), 'TLS_bypass': False, 'profile_scope': 'existing_isolated_exact_host_CA', 'provider_writes': 0, 'messages_sent': 0, 'source_writes': 0, 'real_customer_writes': 0}
            Path(report_file).write_text(json.dumps(report, indent=2) + '\n'); Path(report_file).chmod(0o600)
            return report
        finally: ctx.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--session-file', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    try:
        r = audit(args.session_file, args.report)
        print(json.dumps({k: r[k] for k in ['as_of', 'passed', 'total', 'issues', 'browser_requests', 'foreign_requests']}))
    except Exception as e:
        raise SystemExit('native_browser_audit_failed_' + type(e).__name__)
