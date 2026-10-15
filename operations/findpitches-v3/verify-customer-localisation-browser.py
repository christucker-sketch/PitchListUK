"""Customer language checks, no external services, real messages or payments.
Native mode uses the existing restricted-preview relay with verified upstream TLS.
"""
import argparse, datetime, json, os, importlib.util, sys
sys.dont_write_bytecode=True
from urllib.parse import urlsplit, urlencode
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    p=argparse.ArgumentParser();p.add_argument('--base',default='http://127.0.0.1:8794');p.add_argument('--output',required=True);p.add_argument('--screenshots');a=p.parse_args()
    assert a.base in ['http://127.0.0.1:8794','http://127.0.0.1:8795','https://findpitches.com'],'owned_harness_preview_or_public_origin_required'
    synthetic=a.base.endswith(':8794');checks=[];foreign=[];errors=[];completed=False
    public=a.base=='https://findpitches.com'
    report={'schema':'findpitches-v3-localisation-browser-v1','mode':'actual_public' if public else 'synthetic_local_worker' if synthetic else 'restricted_deployed_preview_via_verified_https_relay','checks':checks,'messages_sent':0,'payment_objects_created':0,'serper_queries':0,'certificate_bypass':False}
    def check(name,condition):
        checks.append({'name':name,'passed':bool(condition)})
        print(('PASS ' if condition else 'FAIL ')+name,flush=True)
        if not condition:raise AssertionError(name)
    try:
      with sync_playwright() as pw:
        browser=None if public else pw.chromium.launch(executable_path='/usr/bin/chromium')
        for device,viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
          if public:
            spec=importlib.util.spec_from_file_location('v3_owned_browser_trust',Path(__file__).with_name('verify-customer-map-browser.py'));trusted=importlib.util.module_from_spec(spec);spec.loader.exec_module(trusted)
            u=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY']);proxy={'server':f'{u.scheme}://{u.hostname}:{u.port}'}
            if u.username:proxy.update(username=u.username,password=u.password)
            ctx=trusted.verified_public_context(pw,proxy,viewport)
          else:ctx=browser.new_context(viewport=viewport,reduced_motion='reduce')
          page=ctx.new_page()
          page.on('pageerror',lambda e:errors.append(str(e)))
          def route(r):
            if r.request.url.startswith(a.base+'/') or r.request.url.startswith('data:'):r.continue_()
            else:foreign.append(r.request.resource_type);r.abort()
          ctx.route('**/*',route)
          def visit(path,selector='#languageSelect'):
            r=page.goto(a.base+path,wait_until='domcontentloaded',timeout=90000);page.locator(selector).first.wait_for(timeout=90000);page.evaluate('FP.ready');check(device+': '+path+' loads',r.status==200)
          for lang,word in [('de','Standplätze'),('fr','emplacement')]:
            visit('/lang/'+lang+'/')
            check(device+': '+lang+' language and home',page.locator('html').get_attribute('lang')==lang and page.locator('#languageSelect').input_value()==lang)
            check(device+': '+lang+' navigation',word.lower() in page.locator('#fp-top').text_content().lower() and page.locator('#languageSelect').is_visible())
            check(device+': '+lang+' language control inside header',page.locator('#languageSelect').evaluate('(e)=>{const a=e.getBoundingClientRect(),b=e.closest(\"header\").getBoundingClientRect();return a.top>=b.top && a.bottom<=b.bottom;}'))
            page.locator('#seoCols a').first.wait_for(timeout=90000)
            check(device+': '+lang+' category links translated',('Standplätze' if lang=='de' else 'Exposants') in page.locator('#seoCols').inner_text())
            with page.expect_response(lambda r:'/api/v3/opportunities?' in r.url and 'market=GB' in r.url and r.request.method=='GET',timeout=90000) as actual:
                visit('/lang/'+lang+'/uk/find-pitches/','#list .ocard h3 a')
            data=actual.value.json()
            titles=page.locator('#list .ocard h3 a').all_text_contents();expected=[o['title'] for o in data['results']]
            check(device+': '+lang+' original source titles',set(titles)==set(expected) and bool(titles))
            check(device+': '+lang+' country separate',page.evaluate("FP.state.market==='GB' && FP.i18n.current==='"+lang+"'"))
            oid=data['results'][0]['id'];original=data['results'][0]
            visit('/lang/'+lang+'/uk/opportunity/'+oid+'/','.ohead h1')
            check(device+': '+lang+' detail source immutable',page.locator('.ohead h1').inner_text()==original['title'])
            check(device+': '+lang+' Free still redacted',page.locator('[data-apply]').count()==0)
            check(device+': '+lang+' source language disclosure',page.locator('.source-language-note').is_visible())
            check(device+': '+lang+' locale canonical',('/lang/'+lang+'/uk/opportunity/'+oid+'/') in page.locator('link[rel=canonical]').first.get_attribute('href'))
            for path,selector in [('/uk/','#page h1'),('/pricing/','.plan'),('/account.html','#gSign'),('/saved.html','#gSign'),('/alerts.html','main h1'),('/organisers/','form')]:visit('/lang/'+lang+path,selector)
            visit('/lang/'+lang+'/uk/','#page .side')
            check(device+': '+lang+' practical guidance translated','public liability insurance' not in page.locator('#page .side').inner_text())
            visit('/lang/'+lang+'/account.html','#gSign');page.locator('#gSign').click();page.locator('#siEmail').wait_for()
            check(device+': '+lang+' translated sign-in modal',page.locator('#si').inner_text().find('Email me a sign-in link')<0 and page.locator('#siHelp').inner_text().find('15')>=0)
            page.locator('[data-close]').first.click()
            visit('/lang/'+lang+'/fr/find-pitches/','main h1')
            check(device+': '+lang+' France language independent',page.evaluate("FP.state.market==='FR' && FP.i18n.current==='"+lang+"'"))
            visit('/lang/'+lang+'/us/find-pitches/','#list .ocard h3 a')
            check(device+': '+lang+' US retains country and miles',page.evaluate("FP.state.market==='US' && FP.state.m().distance_unit==='mi'"))
            check(device+': '+lang+' map usable',page.locator('#map').count()==1)
            if a.screenshots:
                out=Path(a.screenshots);out.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(out/(device+'-'+lang+'.png')),full_page=True)
            check(device+': '+lang+' no horizontal page overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'))
          # Use a region actually present in the rendered source response;
          # a guessed county may legitimately have zero current READY.
          query={'sort':'recently_checked'}
          if original['location'].get('region_name'):query['q']=original['location']['region_name']
          visit('/lang/de/uk/find-pitches/?'+urlencode(query),'#list .ocard h3 a')
          before=page.evaluate('Object.fromEntries(new URLSearchParams(location.search))');page.locator('#languageSelect').select_option('fr');page.wait_for_url('**/lang/fr/**');page.locator('#list .ocard h3 a').first.wait_for(timeout=90000)
          check(device+': switching preserves country and filters',page.evaluate('Object.fromEntries(new URLSearchParams(location.search))')==before and page.evaluate("FP.state.market==='GB'"))
          page.locator('#languageSelect').select_option('en');page.wait_for_url('**/uk/find-pitches/**');page.locator('#languageSelect').wait_for()
          check(device+': English URLs preserved','/lang/' not in page.url and page.locator('html').get_attribute('lang')=='en')
          if synthetic:
            page.request.post(a.base+'/__fixture/login')
            visit('/lang/de/uk/opportunity/ent_'+'1'*32+'/','.ohead h1')
            check(device+': Pro retains original organiser and application route',page.locator('[data-apply]').first.get_attribute('href')=='https://organiser.example.org/apply' and 'Market' in page.locator('.facts').inner_text())
            ld=page.locator('script[type="application/ld+json"]').all_text_contents()
            check(device+': schema types never translated',any('"@type":"Event"' in s for s in ld))
          ctx.close()
        check('zero page errors',not errors);check('zero external browser requests',not foreign)
        if browser:browser.close()
        completed=True
    finally:
      report.update(as_of=datetime.datetime.now(datetime.timezone.utc).isoformat(),completed=completed,passed=completed and bool(checks) and all(c['passed'] for c in checks) and not errors,total=len(checks),page_errors=errors,foreign_requests=len(foreign));Path(a.output).write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
