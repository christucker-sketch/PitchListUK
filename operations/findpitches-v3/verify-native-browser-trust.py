"""Bounded native-origin TEST sign-in/TLS probe; never completes hosted billing.

The session file contains a one-use synthetic sign-in URL and stays private.
Use only the dedicated profile prepared by prepare-isolated-browser-trust.py.
No ignore_https_errors, SPKI exception, insecure flag or system trust change.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def verify(session_file, profile, report_file):
    profile = Path(profile).resolve()
    private = Path('/workspace/.pitchlist-cloud/v3-customer-preview')
    if profile != Path('/workspace/.pitchlist-cloud/v3-browser-trust-isolated'):
        raise ValueError('dedicated_private_test_profile_required')
    if Path(session_file).resolve() != private / 'browser-session-private.json':
        raise ValueError('private_synthetic_session_file_required')
    if Path(report_file).resolve() != private / 'browser-trust-report.json':
        raise ValueError('private_report_path_required')
    session = json.loads(Path(session_file).read_text())
    origin = 'https://findpitches-v3-customer-preview.ctucker.workers.dev'
    link = urlsplit(session['dev_link'])
    if link.scheme + '://' + link.netloc != origin or link.path != '/api/v3/session/verify':
        raise ValueError('native_preview_signin_required')
    raw_proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
    proxy = None
    if raw_proxy:
        u = urlsplit(raw_proxy)
        proxy = {'server': f'{u.scheme}://{u.hostname}:{u.port}'}
        if u.username:
            proxy['username'] = u.username
        if u.password:
            proxy['password'] = u.password
    checks, navigation = [], {}
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(profile), executable_path='/usr/bin/chromium', proxy=proxy)
        try:
            ctx.clear_cookies()
            page = ctx.new_page()
            r = page.goto(origin + '/health', wait_until='domcontentloaded', timeout=60000)
            if r.status != 200:
                raise ValueError('native_health_failed')
            navigation['native_preview'] = {'trusted': True, 'status': r.status}
            checks.append('native_origin_certificate_validation')
            r = page.goto(origin + '/', wait_until='domcontentloaded', timeout=60000)
            if r.status != 401:
                raise ValueError('unauthorized_preview_not_denied')
            checks.append('unauthorized_preview_denied')
            page.goto(session['dev_link'], wait_until='domcontentloaded', timeout=60000)
            data = page.evaluate("""async () => {
                const s = await fetch('/api/v3/session').then(r => r.json());
                const g = await fetch('/api/v3/opportunities?market=GB&page_size=1').then(r => r.json());
                return {signed_in: s.signed_in, tier: s.access?.tier,
                    count: g.results?.length, redacted: g.results?.every(r =>
                        r.access?.locked && !r.access.application_url && !r.access.source_url)};
            }""")
            if not data['signed_in'] or data['tier'] != 'free':
                raise ValueError('native_synthetic_signin_failed')
            checks.append('native_browser_signin_consumed_challenge')
            if data['count'] != 1 or not data['redacted']:
                raise ValueError('ended_subscription_browser_redaction_failed')
            checks.append('ended_subscription_application_links_redacted')
            cookies = ctx.cookies(origin)
            host_cookies = [c for c in cookies if c['name'].startswith('__Host-')]
            if len(host_cookies) < 2 or not all(c['secure'] and c['httpOnly'] and c['path'] == '/' and c['sameSite'] == 'Lax' for c in host_cookies):
                raise ValueError('native_cookie_flags_failed')
            checks.append('native_session_preview_cookie_flags')
            for name, host in [('stripe_checkout_origin', 'checkout.stripe.com'), ('stripe_portal_origin', 'billing.stripe.com'), ('stripe_javascript_origin', 'js.stripe.com')]:
                try:
                    r = page.goto('https://' + host + '/', wait_until='domcontentloaded', timeout=30000)
                    navigation[name] = {'network_reachable': True, 'status': r.status}
                except Exception as e:
                    # Exception strings can contain private browser URLs. Emit
                    # only a known diagnostic, never a raw exception or trace.
                    error = 'ERR_TUNNEL_CONNECTION_FAILED' if 'ERR_TUNNEL_CONNECTION_FAILED' in str(e) else 'browser_navigation_failed'
                    navigation[name] = {'network_reachable': False, 'error': error}
            report = {'schema': 'findpitches-v3-native-browser-trust-v1',
                'as_of': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'browser': 'Chromium ' + ctx.browser.version,
                'profile_scope': 'dedicated_private_test_profile',
                'system_trust_changed': False, 'certificate_bypass': False,
                'passed_native_checks': len(checks), 'checks': checks,
                'navigation': navigation, 'hosted_browser_journey': False,
                'messages_sent': 0, 'provider_writes': 0}
            Path(report_file).write_text(json.dumps(report, indent=2) + '\n')
            Path(report_file).chmod(0o600)
            return report
        finally:
            ctx.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--session-file', required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.session_file, args.profile, args.report)))
    except Exception:
        raise SystemExit('native_browser_trust_verification_failed')
