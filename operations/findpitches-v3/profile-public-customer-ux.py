"""Bounded anonymous public UX proof; no sign-in, payment or message writes."""
import argparse, datetime, json, os, time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--production-dir',required=True)
    parser.add_argument('--phase',choices=['before','after'],required=True)
    args=parser.parse_args();base='https://findpitches.com';samples=[]
    proxy_url=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY'])
    proxy={'server':f'{proxy_url.scheme}://{proxy_url.hostname}:{proxy_url.port}'}
    if proxy_url.username:proxy.update(username=proxy_url.username,password=proxy_url.password)
    report={'schema':'findpitches-v3-public-ux-v1','phase':args.phase,'passed':False,'samples':samples,'certificate_bypass':False,'customer_objects_created':0,'messages_sent':0}
    output=Path(args.production_dir)/('ux-browser-'+args.phase+'.json')
    def save():
        report['as_of']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2)+'\n');output.chmod(0o600)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',proxy=proxy)
        try:
            for label,viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
                context=browser.new_context(viewport=viewport);errors=[];foreign=[];calls=[]
                def route(r):
                    if r.request.url.startswith(base+'/') or r.request.url.startswith('data:'):r.continue_()
                    else:foreign.append(urlsplit(r.request.url).hostname);r.abort()
                context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda _:errors.append('page_error'))
                page.on('request',lambda r:calls.append(urlsplit(r.url).path) if '/api/v3/' in r.url else None)
                start=time.monotonic();response=page.goto(base+'/',wait_until='domcontentloaded',timeout=75000)
                document_ms=round((time.monotonic()-start)*1000)
                page.locator('#clist button').first.wait_for(state='visible',timeout=75000)
                home_ms=round((time.monotonic()-start)*1000)
                rows=page.locator('#boardBody a').count();areas=page.locator('#coverageAreas a').count()
                sample={'device':label,'homepage_status':response.status,'document_ms':document_ms,'homepage_data_ms':home_ms,'upcoming_rows':rows,'uk_area_links':areas,'homepage_api_calls':list(calls)};samples.append(sample);save()
                if args.phase=='after':
                    assert response.status==200 and rows>0 and areas>1
                    assert calls.count('/api/v3/home')==1 and '/api/v3/stats' not in calls and '/api/v3/opportunities/upcoming' not in calls
                    page.locator('[data-b="US"]').click();assert page.locator('#boardBody a').count()>0
                start=time.monotonic();page.goto(base+'/finder.html?cc=uk&view=map',wait_until='domcontentloaded',timeout=75000)
                page.locator('#list .ocard').first.wait_for(state='attached',timeout=75000)
                sample['finder_results_ms']=round((time.monotonic()-start)*1000);sample['uk_map_pins']=page.locator('#map .pin').count();sample['map_note']=page.locator('#mapNote').inner_text()
                if args.phase=='after' and not sample['uk_map_pins']:assert 'No verified coordinates' in sample['map_note'] and 'remain in the list' in sample['map_note']
                assert not errors and not foreign
                sample['page_errors']=len(errors);sample['foreign_requests']=len(foreign);context.close();save()
            report['passed']=True;report['observation_completed']=True;report['acceptance_passed']=args.phase=='after';save();print(json.dumps(report))
        finally:browser.close()

if __name__=='__main__':main()
