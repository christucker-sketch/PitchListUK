"""One genuine hosted Stripe TEST journey; all browser state remains private.

No API-created subscription, cache/date edits, TLS bypass, real mail or legacy IO.
The companion permits only canonical TEST reads and this fixture's TEST clock.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path('/workspace/PitchListUK')
PRIVATE = Path('/workspace/.pitchlist-cloud/v3-customer-preview')
PROFILE = Path('/workspace/.pitchlist-cloud/v3-browser-trust-isolated')
ORIGIN = 'https://findpitches-v3-customer-preview.ctucker.workers.dev'


def fixture(action):
    r = subprocess.run(['node', str(ROOT / 'operations/findpitches-v3/hosted-customer-fixture.mjs'),
        '--action', action, '--credentials', '/tmp/findpitches-codex-cloudflare.env',
        '--customer-dir', str(PRIVATE)], capture_output=True, text=True)
    if r.returncode:
        code = r.stderr.strip()
        raise ValueError(code if re.fullmatch('[a-z0-9_]+', code) else 'fixture_action_failed')
    return json.loads(r.stdout)


def write_private(name, value):
    p = PRIVATE / name
    p.write_text(json.dumps(value, indent=2) + '\n')
    p.chmod(0o600)


def verify(phase):
    checks, transitions = [], []
    progress_file = PRIVATE / 'hosted-browser-progress-private.json'
    progress = json.loads(progress_file.read_text()) if progress_file.exists() else {}
    checks = progress.get('checks', [])
    transitions = progress.get('transitions', [])
    if phase == 'report':
        state=json.loads((PRIVATE/'hosted-journey-private.json').read_text())
        canonical=fixture('inspect')
        required=['real_origin_trusted_tls','uninvited_preview_denied','native_browser_signin_free','native_single_test_checkout_custody','actual_hosted_checkout_origin','hosted_checkout_completed_and_returned','hosted_trial_pro_features','trial_application_route_and_market_scope','existing_hosted_test_customer_clock_attached','actual_test_trial_end_active_entitlement','native_owned_portal_created','actual_hosted_portal_origin','actual_hosted_portal_period_end_cancellation','scheduled_cancel_keeps_paid_through_pro','paid_through_application_routes_remain_unlocked','customer_cancel_notice_matches_canonical_end','actual_test_period_end_removes_pro','ended_application_source_routes_redacted','ended_trial_not_offered_again','ended_account_truthful_billing_copy','returning_pricing_no_second_trial_promise','ended_retains_single_subscription_and_checkout']
        if not state.get('completed_at') or canonical['provider_status']!='canceled' or any(k not in checks for k in required):
            raise ValueError('complete_hosted_evidence_required')
        report={'schema':'findpitches-v3-hosted-browser-journey-v1','as_of':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'synthetic_test_only','actual_hosted_checkout':True,'actual_hosted_portal_cancel':True,'temporal_proof':'Stripe TEST clock attached to the customer after actual hosted card Checkout; no API-created subscription or cache/date edits','checks_passed':len(required),'checks':required,'transitions':transitions,'fixture_counts':{'native_customers':1,'stripe_test_customers':1,'checkout_sessions':1,'subscriptions':canonical['provider_subscription_count'],'test_clocks':1},'object_custody_sha256':{k:hashlib.sha256(state[k].encode()).hexdigest() for k in ['native_customer_id','stripe_customer_id','checkout_session_id','subscription_id','clock_id']},'final_provider_state':canonical,'real_charges':0,'real_subscriber_imports':0,'messages_sent':0,'serper_queries':0,'publication_enabled':False,'production_cutover_enabled':False,'certificate_bypass':False,'system_trust_changed':False,'private_urls_or_cookies_published':False,'limitations':['TEST time advancement is not real elapsed calendar time','Live subscriber/product/price migration remains gated','Optional Stripe marketing/hCaptcha origins were denied; neither was required to complete this TEST journey']}
        write_private('hosted-journey-report.json',report)
        print(json.dumps(report),flush=True)
        return
    def check(name, ok):
        if not ok:
            raise ValueError('hosted_check_failed_' + name)
        if name not in checks:
            checks.append(name)
        progress.update(checks=checks, transitions=transitions)
        write_private(progress_file.name, progress)
        print(json.dumps({'passed': name}), flush=True)
    def transition(name, state):
        transitions.append({'name': name, 'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'state': state})
    def wait_provider(status, attempts=24):
        for _ in range(attempts):
            data = fixture('inspect')
            if data['provider_status'] == status and data['clock_status'] == 'ready':
                return data
            time.sleep(3)
        raise ValueError('provider_clock_transition_timeout')
    state = json.loads((PRIVATE / 'hosted-journey-private.json').read_text())
    if state.get('completed_at') and phase != 'verify-ended':
        raise ValueError('completed_hosted_fixture_use_retained_report')
    u = urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY'])
    proxy = {'server': f'{u.scheme}://{u.hostname}:{u.port}'}
    if u.username:
        proxy['username'] = u.username
    if u.password:
        proxy['password'] = u.password
    network = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(str(PROFILE), executable_path='/usr/bin/chromium', proxy=proxy)
        page = ctx.new_page()
        page.on('requestfailed', lambda r: network.append({'host': urlsplit(r.url).hostname, 'error': r.failure}))
        try:
            def native_access():
                state_now = json.loads((PRIVATE / 'hosted-journey-private.json').read_text())
                for _ in range(3):
                    result = page.evaluate("""async (id) => {
                        await FP.api.billing.confirmCheckout({session_id:id});
                        return FP.api.session.get();
                    }""", state_now['checkout_session_id'])
                    if result['access']['tier'] != 'free' or result['access']['status'] == 'canceled':
                        return result['access']
                return result['access']
            def application_state():
                return page.evaluate("""async () => {
                    const g = await FP.api.opportunities.search({market:'GB',page_size:1});
                    const u = await FP.api.opportunities.search({market:'US',page_size:1});
                    return {count:g.results.length,gb_unlocked:g.results.every(r=>!r.access.locked && /^https:/.test(r.access.application_url)),
                        gb_redacted:g.results.every(r=>r.access.locked && !r.access.application_url && !r.access.source_url),
                        us_locked:u.results.every(r=>r.access.locked)};
                }""")
            if phase == 'checkout':
                if not progress.get('checkout_url') and state.get('checkout_url'):
                    progress['checkout_url'] = state['checkout_url']
                    check('native_single_test_checkout_custody', fixture('inspect')['checkout_status']=='open')
                if not progress.get('checkout_url'):
                    ctx.clear_cookies()
                    r = page.goto(ORIGIN + '/health', wait_until='domcontentloaded', timeout=60000)
                    check('real_origin_trusted_tls', r.status == 200)
                    r = page.goto(ORIGIN + '/', wait_until='domcontentloaded', timeout=60000)
                    check('uninvited_preview_denied', r.status == 401)
                    page.goto(state['dev_link'], wait_until='domcontentloaded', timeout=60000)
                    page.locator('[data-start="pro_monthly"]').wait_for(timeout=60000)
                    session = page.evaluate('() => FP.api.session.get()')
                    check('native_browser_signin_free', session['signed_in'] and session['access']['tier'] == 'free')
                    with page.expect_response(lambda r: urlsplit(r.url).path == '/api/v3/billing/checkout' and r.request.method == 'POST', timeout=60000) as response:
                        page.locator('[data-start="pro_monthly"]').click()
                    # The frontend navigates immediately on success; a response
                    # body may already be unavailable. Read the one exact
                    # native/provider session instead of starting Checkout again.
                    canonical = fixture('inspect')
                    url = json.loads((PRIVATE / 'hosted-journey-private.json').read_text())['checkout_url']
                    check('native_single_test_checkout_custody', response.value.status == 200 and canonical['checkout_status']=='open' and url.startswith('https://checkout.stripe.com/'))
                    progress['checkout_url'] = url
                    write_private(progress_file.name, progress)
                page.goto(progress['checkout_url'], wait_until='domcontentloaded', timeout=60000)
                check('actual_hosted_checkout_origin', urlsplit(page.url).hostname == 'checkout.stripe.com')
            elif phase in ['inspect-checkout', 'submit-checkout']:
                page.goto(progress['checkout_url'], wait_until='domcontentloaded', timeout=60000)
            elif phase in ['cancel-portal', 'inspect-cancel']:
                page.goto(progress['portal_url'], wait_until='domcontentloaded', timeout=60000)
            else:
                page.goto(ORIGIN + '/account.html', wait_until='domcontentloaded', timeout=60000)
                page.locator('#planH').wait_for(timeout=60000)
            if phase in ['checkout', 'inspect-checkout']:
                page.wait_for_timeout(3000)
                descriptors = []
                for f in page.frames:
                    descriptors.append({'host': urlsplit(f.url).hostname, 'inputs': f.locator('input,select').evaluate_all("es => es.map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,placeholder:e.placeholder,label:e.getAttribute('aria-label')}))"), 'buttons': f.get_by_role('button').all_text_contents()})
                write_private('hosted-checkout-dom-private.json', descriptors)
                print(json.dumps({'checkout_form': descriptors}), flush=True)
                return
            if phase == 'submit-checkout':
                page.locator('#cardNumber').wait_for(state='visible',timeout=60000)
                def fill(candidates, value):
                    for f in page.frames:
                        for selector in candidates:
                            loc = f.locator(selector)
                            if loc.count() and loc.first.is_visible():
                                loc.first.fill(value)
                                return
                    raise ValueError('hosted_card_field_not_found')
                if page.locator('#billingCountry').count():
                    page.locator('#billingCountry').select_option('GB')
                gbp = page.get_by_role('button', name='GBP', exact=True)
                if gbp.count() and gbp.first.is_visible():
                    gbp.first.click()
                if page.locator('#enableStripePass').count() and page.locator('#enableStripePass').is_checked():
                    page.locator('#enableStripePass').uncheck()
                page.locator('#cardNumber').wait_for(state='visible',timeout=60000)
                fill(['#cardNumber','input[name="cardNumber"]','input[name="cardnumber"]','input[autocomplete="cc-number"]'], '4242424242424242')
                fill(['#cardExpiry','input[name="cardExpiry"]','input[name="exp-date"]','input[autocomplete="cc-exp"]'], '1230')
                fill(['#cardCvc','input[name="cardCvc"]','input[name="cvc"]','input[autocomplete="cc-csc"]'], '123')
                fill(['#billingName','input[name="billingName"]','input[autocomplete="cc-name"]'], 'V3 Synthetic TEST')
                if page.locator('#billingPostalCode').count():
                    page.locator('#billingPostalCode').fill('SW1A 1AA')
                button = page.locator('button[type="submit"]').filter(has_text=re.compile('Start trial|Subscribe|Pay', re.I)).first
                button.click(timeout=30000)
                page.wait_for_url(re.compile(re.escape(ORIGIN) + '/account'), timeout=90000, wait_until='domcontentloaded')
                page.locator('#planH').wait_for(timeout=60000)
                canonical = fixture('inspect')
                check('hosted_checkout_completed_and_returned', canonical['checkout_status']=='complete' and canonical['native_checkout_completed'] and canonical['provider_subscription_count']==1)
                access = native_access()
                check('hosted_trial_pro_features', access['tier']=='trial' and access['market']=='GB')
                links = application_state()
                check('trial_application_route_and_market_scope', links['count']==1 and links['gb_unlocked'] and links['us_locked'])
                transition('hosted_checkout_return', {'tier':access['tier'],'canonical_status':canonical['provider_status']})
            if phase in ['submit-checkout', 'advance-trial']:
                fixture('attach-clock')
                check('existing_hosted_test_customer_clock_attached', wait_provider('trialing')['clock_status']=='ready')
                fixture('advance-trial')
                canonical = wait_provider('active')
                access = native_access()
                check('actual_test_trial_end_active_entitlement', access['tier']=='pro' and canonical['provider_status']=='active')
                transition('test_clock_trial_end', {'tier':access['tier'],'canonical_status':canonical['provider_status'],'clock_time':canonical['clock_frozen_time']})
            if phase in ['submit-checkout','advance-trial','portal','inspect-portal']:
                with page.expect_response(lambda r: urlsplit(r.url).path=='/api/v3/billing/portal' and r.request.method=='POST', timeout=60000) as response:
                    page.locator('#portal').click()
                page.wait_for_url(re.compile('https://billing\\.stripe\\.com/'), timeout=60000, wait_until='domcontentloaded')
                portal_url = page.url
                check('native_owned_portal_created', response.value.status==200 and portal_url.startswith('https://billing.stripe.com/'))
                progress['portal_url'] = portal_url
                write_private(progress_file.name, progress)
                check('actual_hosted_portal_origin', urlsplit(page.url).hostname=='billing.stripe.com')
                page.get_by_role('link',name=re.compile('^Cancel (plan|subscription)$',re.I)).first.wait_for(timeout=60000)
                write_private('hosted-portal-dom-private.json', {'buttons':page.get_by_role('button').all_text_contents(),'links':page.get_by_role('link').all_text_contents()})
                print(json.dumps({'portal_buttons':page.get_by_role('button').all_text_contents(),'portal_links':page.get_by_role('link').all_text_contents()}), flush=True)
                return
            if phase in ['cancel-portal', 'inspect-cancel']:
                page.get_by_role('link',name=re.compile('^Cancel (plan|subscription)$',re.I)).first.click(timeout=60000)
                page.get_by_role('button',name=re.compile('^Cancel (plan|subscription)$',re.I)).first.wait_for(timeout=60000)
                write_private('hosted-cancel-dom-private.json', {'body':page.locator('body').inner_text(),'buttons':page.get_by_role('button').all_text_contents(),'links':page.get_by_role('link').all_text_contents()})
                print(json.dumps({'cancel_buttons':page.get_by_role('button').all_text_contents(),'cancel_links':page.get_by_role('link').all_text_contents()}),flush=True)
                return
            if phase == 'cancel-and-end':
                canonical=fixture('inspect')
                check('single_active_hosted_subscription_before_cancel', canonical['provider_status']=='active' and canonical['provider_subscription_count']==1)
                before_end=canonical['period_end']
                if not canonical['cancel_at_period_end']:
                    page.goto(progress['portal_url'],wait_until='domcontentloaded',timeout=60000)
                    page.get_by_role('link',name=re.compile('^Cancel (plan|subscription)$',re.I)).first.click(timeout=60000)
                    page.get_by_role('button',name=re.compile('^Cancel (plan|subscription)',re.I)).first.click(timeout=60000)
                    for _ in range(24):
                        canonical=fixture('inspect')
                        if canonical['cancel_at_period_end']:
                            break
                        time.sleep(3)
                    check('actual_hosted_portal_period_end_cancellation',canonical['cancel_at_period_end'] and canonical['provider_status']=='active' and canonical['period_end']==before_end)
                    page.get_by_role('link',name=re.compile('^Return to ')).first.click(timeout=60000)
                    page.wait_for_url(re.compile(re.escape(ORIGIN)+'/account'),timeout=60000,wait_until='domcontentloaded')
                page.locator('#planH').wait_for(timeout=60000)
                access=native_access()
                check('scheduled_cancel_keeps_paid_through_pro',access['tier']=='pro' and access['cancel_at_period_end'] and access['renews_on']==before_end)
                links=application_state()
                check('paid_through_application_routes_remain_unlocked',links['count']==1 and links['gb_unlocked'] and links['us_locked'])
                page.reload(wait_until='domcontentloaded')
                page.get_by_text('Your plan won’t renew.',exact=False).wait_for(timeout=60000)
                check('customer_cancel_notice_matches_canonical_end',page.get_by_text('Your plan won’t renew.',exact=False).count()==1)
                transition('hosted_portal_cancel_paid_through',{'tier':access['tier'],'canonical_status':canonical['provider_status'],'cancel_at_period_end':True,'period_end':before_end})
                fixture('advance-end')
                canonical=wait_provider('canceled')
                access=native_access()
                check('actual_test_period_end_removes_pro',access['tier']=='free' and canonical['provider_status']=='canceled')
                links=application_state()
                check('ended_application_source_routes_redacted',links['count']==1 and links['gb_redacted'] and links['us_locked'])
                transition('test_clock_period_end',{'tier':access['tier'],'canonical_status':canonical['provider_status'],'clock_time':canonical['clock_frozen_time']})
                fixture('complete')
                return
            if phase == 'verify-ended':
                canonical=fixture('inspect')
                access=native_access()
                check('ended_trial_not_offered_again',canonical['provider_status']=='canceled' and access['tier']=='free' and access['trial_eligible'] is False)
                page.reload(wait_until='domcontentloaded')
                page.get_by_text('Your Pro plan has ended.',exact=False).wait_for(timeout=60000)
                check('ended_account_truthful_billing_copy',page.get_by_role('link',name='Subscribe to Pro',exact=True).count()==1 and page.get_by_text('Try Pro free for 7 days',exact=True).count()==0)
                page.goto(ORIGIN+'/pricing.html',wait_until='domcontentloaded')
                page.locator('[data-start="pro_monthly"]').wait_for(timeout=60000)
                check('returning_pricing_no_second_trial_promise',page.locator('[data-start="pro_monthly"]').inner_text()=='Subscribe' and '7-day free trial' not in page.locator('#plans').inner_text())
                check('ended_retains_single_subscription_and_checkout',canonical['provider_subscription_count']==1 and canonical['checkout_status']=='complete')
                return
        except Exception as e:
            write_private('hosted-failure-dom-private.json', {'body':page.locator('body').inner_text(),'buttons':page.get_by_role('button').all_text_contents(),'links':page.get_by_role('link').all_text_contents()})
            write_private('hosted-failure-private.json', {'phase':phase,'error':str(e),'url':page.url,'network':network})
            code = str(e) if isinstance(e,ValueError) and re.fullmatch('[a-z0-9_]+',str(e)) else 'hosted_browser_phase_failed'
            print(json.dumps({'failed_phase':phase,'diagnostic':code,'network_errors':network}),flush=True)
            raise SystemExit(1)
        finally:
            progress.update(checks=checks,transitions=transitions)
            write_private(progress_file.name, progress)
            ctx.close()


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--phase',required=True,choices=['checkout','inspect-checkout','submit-checkout','advance-trial','portal','inspect-portal','cancel-portal','inspect-cancel','cancel-and-end','verify-ended','report'])
    verify(parser.parse_args().phase)
