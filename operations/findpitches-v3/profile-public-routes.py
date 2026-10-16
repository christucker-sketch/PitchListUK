"""Fresh anonymous public browser timings; never sign in or mutate billing/source state."""
import argparse, datetime, importlib.util, json, os, sys, time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('verified_map_browser',Path(__file__).with_name('verify-customer-map-browser.py'))
trusted=importlib.util.module_from_spec(spec);spec.loader.exec_module(trusted)
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--phase',choices=['before','after'],required=True);args=parser.parse_args()
base='https://findpitches.com';output=Path(args.output);samples=[]
u=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY']);proxy={'server':f'{u.scheme}://{u.hostname}:{u.port}'}
if u.username:proxy.update(username=u.username,password=u.password)
report={'schema':'findpitches-v3-route-browser-profile-v1','phase':args.phase,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'samples':samples,'passed':False,'certificate_bypass':False,'fresh_anonymous_profiles':True,'forced_cold_isolates':False,'customer_objects_created':0,'messages_sent':0,'billing_source_or_acquisition_actions':0}
def save():output.write_text(json.dumps(report,indent=2)+'\n');output.chmod(0o600)
def resources(page):
 return page.evaluate("""()=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin===location.origin).map(r=>({path:new URL(r.name).pathname,type:r.initiatorType,start_ms:Math.round(r.startTime),duration_ms:Math.round(r.duration),ttfb_ms:Math.round(r.responseStart-r.requestStart),transfer_bytes:r.transferSize,encoded_bytes:r.encodedBodySize}))""")
save()
with sync_playwright() as p:
 for device,viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
  context=trusted.verified_public_context(p,proxy,viewport);page=context.new_page();errors=[];blocked=[]
  page.on('pageerror',lambda _:errors.append('script_error'))
  def route(r):
   if r.request.url.startswith(base+'/') and (r.request.method in ['GET','HEAD'] or urlsplit(r.request.url).path=='/api/v3/seo/inventory'):r.continue_()
   else:blocked.append({'host':urlsplit(r.request.url).hostname,'method':r.request.method});r.abort()
  context.route('**/*',route)
  seed=context.request.get(base+'/api/v3/opportunities?market=GB&limit=1',timeout=60000).json();listing=seed['results'][0]['canonical_path']
  routes=[('homepage','/','#boardBody a'),('finder','/finder.html?cc=uk','#list .ocard'),('country','/uk/','#page h1'),('category','/uk/christmas-market-stalls/','#page h1'),('listing',listing,'#page h1'),('map','/us/find-pitches/?view=map','#map .pin'),('account','/account.html','#gSign'),('billing','/billing.html','#billingSignIn')]
  for name,path,selector in routes:
   start=time.monotonic();response=page.goto(base+path,wait_until='domcontentloaded',timeout=90000);document_ms=round((time.monotonic()-start)*1000);page.locator(selector).first.wait_for(state='visible',timeout=90000)
   ready_ms=round((time.monotonic()-start)*1000);row={'device':device,'path_name':name,'status':response.status,'document_ms':document_ms,'ready_ms':ready_ms,'resources':resources(page),'navigation':page.evaluate("""()=>{const n=performance.getEntriesByType('navigation')[0];return {ttfb_ms:Math.round(n.responseStart-n.requestStart),document_bytes:n.encodedBodySize,dom_interactive_ms:Math.round(n.domInteractive),dom_content_loaded_ms:Math.round(n.domContentLoadedEventEnd)};}"""),'paint':page.evaluate("()=>performance.getEntriesByType('paint').map(p=>({name:p.name,ms:Math.round(p.startTime)}))")};samples.append(row);save();assert response.status==200 and not errors and not blocked
   if name=='finder':
    start=time.monotonic();page.locator('#q').fill('market')
    with page.expect_response(lambda r:'/api/v3/opportunities?' in r.url and r.request.method=='GET',timeout=60000):page.get_by_role('button',name='Search',exact=True).click()
    page.wait_for_function("()=>!document.querySelector('#list .skel') && !!document.querySelector('#list .ocard,#list .zero')",timeout=60000)
    samples.append({'device':device,'path_name':'filter_interaction','ready_ms':round((time.monotonic()-start)*1000),'resources':resources(page)});save()
  context.close()
report['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['passed']=True;save();print(json.dumps({'passed':True,'samples':[{'device':r['device'],'path':r['path_name'],'ready_ms':r['ready_ms']} for r in samples]}))
