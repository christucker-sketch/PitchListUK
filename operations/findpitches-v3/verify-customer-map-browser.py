"""Anonymous map acceptance against owned public origin or a local proof fixture."""
import argparse, datetime, hashlib, json, os, sqlite3, ssl, tempfile
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

def verified_public_context(playwright,proxy,viewport):
    # Import only the CA already trusted by this environment, constrained to
    # the two owned public hostnames in a disposable anonymous profile. No
    # system trust edit, certificate bypass or user profile/cookie reuse.
    ca=Path('/usr/local/share/ca-certificates/environment-proxy-ca.crt')
    assert os.environ.get('NODE_EXTRA_CA_CERTS')==str(ca),'existing_environment_ca_required'
    der=ssl.PEM_cert_to_DER_cert(ca.read_text())
    assert der in ssl.create_default_context(cafile=os.environ['SSL_CERT_FILE']).get_ca_certs(binary_form=True),'environment_ca_must_already_be_trusted'
    profile=Path(tempfile.mkdtemp(prefix='venue-map-browser-',dir='/workspace/.pitchlist-cloud'));profile.chmod(0o700)
    options={'executable_path':'/usr/bin/chromium','proxy':proxy,'viewport':viewport,'reduced_motion':'reduce'}
    initial=playwright.chromium.launch_persistent_context(str(profile),**options);initial.close()
    database=profile/'Default/ServerCertificate';assert database.exists(),'chromium_certificate_database_required'
    names=['findpitches.com','www.findpitches.com']
    def message(tag,data):
        length=len(data);encoded=bytearray()
        while length>127:encoded.append((length&127)|128);length>>=7
        encoded.append(length);return bytes([tag])+bytes(encoded)+data
    metadata=message(0x0a,b'\x08\x03')+message(0x12,b''.join(message(0x0a,n.encode()) for n in names))
    with sqlite3.connect(database) as db:
        assert [r[1] for r in db.execute('PRAGMA table_info(certificates)')]==['sha256hash_hex','der_cert','trust_settings'],'supported_chromium_certificate_schema_required'
        db.execute('INSERT OR REPLACE INTO certificates VALUES (?,?,?)',(hashlib.sha256(der).hexdigest(),der,metadata))
    return playwright.chromium.launch_persistent_context(str(profile),**options)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    parser.add_argument('--base-url',default='https://findpitches.com')
    parser.add_argument('--market',choices=['GB','US'],default='GB')
    parser.add_argument('--screenshot-dir')
    args=parser.parse_args();base=args.base_url.rstrip('/')
    assert base in ['https://findpitches.com','http://127.0.0.1:8792'],'owned_origin_required'
    output=Path(args.output);checks=[];samples=[]
    report={'schema':'findpitches-v3-venue-map-browser-v1','scope':'actual_public' if base.startswith('https:') else 'local_retained_proof_fixture','passed':False,'checks':checks,'samples':samples,'certificate_bypass':False,'synthetic_points':0,'serper_queries':0,'customer_provider_objects_created':0,'messages_sent':0}
    def save():
        report['as_of']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2)+'\n');output.chmod(0o600)
    def check(name,passed):
        checks.append({'name':name,'passed':bool(passed)});save();assert passed,name
    proxy=None
    if base.startswith('https:'):
        u=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ['HTTP_PROXY']);proxy={'server':f'{u.scheme}://{u.hostname}:{u.port}'}
        if u.username:proxy.update(username=u.username,password=u.password)
    def search_response(r):return '/api/v3/opportunities?' in r.url and r.request.method=='GET'
    def payload(response):
        data=response.json();assert response.status==200 and data['ok'];return data
    with sync_playwright() as p:
        browser=None if proxy else p.chromium.launch(executable_path='/usr/bin/chromium')
        try:
            for device,viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
                context=verified_public_context(p,proxy,viewport) if proxy else browser.new_context(viewport=viewport,reduced_motion='reduce');page=context.new_page();errors=[];foreign=[]
                page.on('pageerror',lambda _:errors.append('page_error'))
                def route(r):
                    if r.request.url.startswith(base+'/') or r.request.url.startswith('data:'):r.continue_()
                    else:foreign.append(urlsplit(r.request.url).hostname);r.abort()
                context.route('**/*',route)
                with page.expect_response(search_response,timeout=90000) as response:
                    page.goto(base+('/uk' if args.market=='GB' else '/us')+'/find-pitches/?view=map',wait_until='domcontentloaded',timeout=90000)
                data=payload(response.value);page.locator('#map .pin').first.wait_for(state='visible',timeout=90000)
                points=data['map_points'];locations={(p['lat'],p['lng']) for p in points};pins=page.locator('#map .pin')
                check(device+'_real_source_points',len(points)>0 and len({p['id'] for p in points})==len(points))
                check(device+'_one_marker_per_venue',pins.count()==len(locations))
                represented=page.locator('#map .pin').evaluate_all('(els)=>els.flatMap(e=>e.dataset.ids.split(","))')
                check(device+'_all_opportunities_retained',len(represented)==len(points) and set(represented)=={p['id'] for p in points})
                check(device+'_source_coordinates_inside_map',page.locator('#map').evaluate('(svg)=>{const b=svg.viewBox.baseVal;return [...svg.querySelectorAll(".pin")].every(p=>{const x=+p.getAttribute("cx"),y=+p.getAttribute("cy");return Number.isFinite(x)&&Number.isFinite(y)&&x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height;});}'))
                note=page.locator('#mapNote').inner_text();unpinned=data['total']-len(points)
                check(device+'_honest_unpinned_count',not unpinned or str(unpinned) in note and ('no verified coordinates' in note or 'no verified map position' in note))
                grouped=page.locator('#map .pin').evaluate_all('(els)=>els.filter(e=>e.dataset.ids.includes(",")).map(e=>e.dataset.id)')
                check(device+'_grouped_dates_available',bool(grouped))
                pin=page.locator('#map .pin[data-id="'+grouped[0]+'"]');pin.click()
                choices=page.locator('#mapOpportunities');choices.wait_for(state='visible');values=choices.locator('option').evaluate_all('(els)=>els.map(e=>e.value)')
                check(device+'_selector_preserves_ids',len(values)>1 and set(values)<=set(represented))
                choices.select_option(values[-1]);check(device+'_selected_opportunity_details',page.locator('#mapsel [data-qv]').get_attribute('data-qv')==values[-1] and 'hot' in pin.get_attribute('class'))
                pin.focus();page.keyboard.press('Enter');check(device+'_keyboard_marker',page.locator('#mapsel [data-qv]').get_attribute('data-qv')==grouped[0])
                page.locator('#mapExtent').click();check(device+'_extent_option',page.locator('#mapExtent').inner_text()==('Show venues' if args.market=='GB' else 'Whole US') and page.locator('#map .pin').count()==len(locations))
                page.locator('#mapExtent').click();check(device+'_venue_view_restored',page.locator('#mapExtent').inner_text()==('Whole UK' if args.market=='GB' else 'Show addresses') and page.locator('#map .pin').count()==len(locations))
                page.mouse.move(1,1)
                if args.screenshot_dir:
                    page.screenshot(path=str(Path(args.screenshot_dir)/(device+'-venue-map.png')),full_page=True)
                check(device+'_free_source_urls_withheld',all(r['access']['locked'] and r['access']['application_url'] is None and r['access']['source_url'] is None for r in data['results']))
                result=next(r for r in data['results'] if r['id'] in represented);label=result['location']['label']
                with page.expect_response(search_response,timeout=90000) as response:
                    page.locator('#q').fill(label);page.get_by_role('button',name='Search',exact=True).click()
                filtered=payload(response.value);page.wait_for_function('(n)=>document.querySelectorAll("#map .pin").length===n',arg=len({(p['lat'],p['lng']) for p in filtered['map_points']}))
                check(device+'_venue_filter_applies_to_markers',0<len(filtered['map_points'])<len(points) and {p['id'] for p in filtered['map_points']}<set(represented))
                with page.expect_response(search_response,timeout=90000) as response:
                    page.locator('#q').fill('no venue matches this token v3-014');page.get_by_role('button',name='Search',exact=True).click()
                empty=payload(response.value);page.locator('#list .zero').wait_for(state='attached')
                check(device+'_zero_results_clear_markers',empty['total']==0 and not empty['map_points'] and page.locator('#map .pin').count()==0)
                with page.expect_response(search_response,timeout=90000):page.goto(base+'/us/find-pitches/?view=map',wait_until='domcontentloaded',timeout=90000)
                page.locator('#map .st').first.wait_for(state='attached',timeout=90000)
                check(device+'_us_state_coverage_preserved',page.locator('#map .st').count()>=50)
                check(device+'_no_script_errors_or_foreign_requests',not errors and not foreign)
                samples.append({'device':device,'market':args.market,'total':data['total'],'coordinate_opportunities':len(points),'venue_markers':len(locations),'unpinned':unpinned,'page_errors':len(errors),'foreign_requests':len(foreign)})
                context.close();save()
            report['passed']=True;save();print(json.dumps(report))
        finally:
            if browser:browser.close()

if __name__=='__main__':main()
