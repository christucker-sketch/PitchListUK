import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
test('owned browser projection matches generated outlines in lower 48, Alaska and Hawaii',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/geo.js',import.meta.url),'utf8'),context);vm.runInContext(fs.readFileSync(new URL('../../web/findpitches-v3-web/public/assets/js/us-projection.js',import.meta.url),'utf8'),context);
 const reference=JSON.parse(fs.readFileSync(new URL('../../web/findpitches-v3-web/tools/map-assets/projection-reference.json',import.meta.url)));assert.equal(Object.keys(context.window.FP_GEO.us.states).length,51);
 for(const p of reference.points){const xy=context.FP_US_PROJECTION.projectUS(p.lat,p.lng,context.window.FP_GEO.us.projection);assert.ok(xy.every((v,i)=>Math.abs(v-p.xy[i])<1e-8));assert.ok(xy[0]>0&&xy[0]<960&&xy[1]>0&&xy[1]<600);}
 assert.equal(context.FP_US_PROJECTION.projectUS(51.5,-0.12,context.window.FP_GEO.us.projection),null);
});
