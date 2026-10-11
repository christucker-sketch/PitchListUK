"""Anonymous real-origin Build 4 browser proof. No sign-in, mail or payments."""
import argparse, datetime, json, os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

def main():
    a=argparse.ArgumentParser();a.add_argument('--production-dir',required=True);a.add_argument('--checkout-state',choices=['disabled','enabled'],default='disabled');args=a.parse_args()
    base='https://findpitches.com';checks=[];errors=[];foreign=[]
    report={'schema':'findpitches-v3-public-browser-v1','passed':False,'checks':checks,'checkout_state':args.checkout_state,'certificate_bypass':False,'customer_objects_created':0,'messages_sent':0}
    output=Path(args.production_dir)/('public-browser-'+args.checkout_state+'.json')
    def save():
        report['as_of']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2)+'\n');output.chmod(0o600)
    def check(name,ok):
        checks.append({'name':name,'passed':bool(ok)});save()
        if not ok: raise ValueError('public_browser_check_failed')
    u=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY']);proxy={'server':f'{u.scheme}://{u.hostname}:{u.port}'}
    if u.username:proxy.update(username=u.username,password=u.password)
    with sync_playwright() as p:
        ctx=p.chromium.launch_persistent_context('/workspace/.pitchlist-cloud/v3-browser-trust-isolated',executable_path='/usr/bin/chromium',proxy=proxy)
        for old in ctx.pages:old.close()
        def route(r):
            if r.request.url.startswith(base+'/') or r.request.url.startswith('data:'):r.continue_()
            else:foreign.append(urlsplit(r.request.url).hostname);r.abort()
        ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda _:errors.append('browser_error'))
        def visit(path,selector):
            r=page.goto(base+path,wait_until='domcontentloaded',timeout=75000);page.wait_for_selector(selector,timeout=75000);check('page_'+path,r.status==200)
        try:
            visit('/uk/find-pitches/','#list .ocard h3 a');check('uk_real_market',page.evaluate("FP.state.market==='GB'"));check('free_session_redacted',page.evaluate("FP.state.session.access.tier==='free'"))
            record=page.evaluate("FP.api.opportunities.search({market:'GB',page_size:1}).then(r=>r.results[0])");check('entity_is_real_and_locked',record['id'].startswith('ent_') and record['access']['locked'] and not record['access'].get('application_url') and not record['access'].get('source_url'))
            visit(record['canonical_path'],'h1');check('event_canonical',page.locator('link[rel=canonical]').get_attribute('href')==base+record['canonical_path']);check('free_apply_link_withheld',page.evaluate("![...document.querySelectorAll('[data-apply]')].some(a=>a.href&&a.href.startsWith('https://'))"))
            visit('/us/find-pitches/','#list .ocard h3 a');check('us_real_market',page.evaluate("FP.state.market==='US'"))
            visit('/pricing.html','#plans .plan.pro');check('supported_currency_choices',page.locator('#pcSel option').evaluate_all("es=>es.map(e=>e.value)")==['GBP','USD','EUR'])
            for currency,label in [('GBP','£4.99'),('USD','$6.99'),('EUR','€5.99')]:
                page.select_option('#pcSel',currency);page.wait_for_function("label=>document.querySelector('#plans .plan.pro .price').textContent.includes(label)",arg=label,timeout=30000);check('displayed_'+currency,label in page.locator('#plans .plan.pro .price').inner_text())
            check('truthful_alerts_copy','coming later' in page.locator('#plans').inner_text().lower())
            check('checkout_gate_matches',page.locator('[data-start="pro_monthly"]').count()==(1 if args.checkout_state=='enabled' else 0))
            visit('/account.html','main');check('account_noindex','noindex' in page.locator('meta[name=robots]').get_attribute('content'))
            visit('/alerts.html','#al');page.wait_for_function("document.querySelector('#al').textContent.toLowerCase().includes('coming later')",timeout=30000);check('alerts_unavailable',True)
            check('no_browser_errors',not errors);check('same_origin_assets_and_api',not foreign);report['passed']=True;save();print(json.dumps(report),flush=True)
        finally:ctx.close()

if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('public_customer_browser_verification_failed')
