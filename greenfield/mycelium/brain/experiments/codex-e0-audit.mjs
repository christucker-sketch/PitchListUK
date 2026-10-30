// Independent E0 diagnostic ablations, Codex, 30 Oct 2026.
// Synthetic only; no network, model, Neon or host action. Original e0-sim.mjs stays untouched.
// Run: node codex-e0-audit.mjs [runs=20] [budget=1500] [worldSeedOffset=1000] > codex-e0-audit-results.json
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as original from './fixtures/e0-sim-b1170595.mjs';
const source=await readFile(new URL('./fixtures/e0-sim-b1170595.mjs',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'b6fc0fd72ee88726a4f1352f9a67df2845c1837ae425a66c6434ca6b66a22ed4','review fixture must remain exact');
const runs=Number(process.argv[2]??20),budget=Number(process.argv[3]??1500),worldSeedOffset=Number(process.argv[4]??1000);
assert.ok(Number.isInteger(runs)&&runs>1&&Number.isInteger(budget)&&budget>0&&Number.isInteger(worldSeedOffset)&&worldSeedOffset>=0);
const load=async s=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
function replaceOnce(s,a,b){assert.ok(s.includes(a),'source patch anchor missing');return s.replace(a,b);}
const gammaCode=`const beta = (r, a, b) => {
  const normal=()=>Math.sqrt(-2*Math.log(Math.max(r(),Number.MIN_VALUE)))*Math.cos(2*Math.PI*r());
  const gamma=k=>{ if(k<1)return gamma(k+1)*Math.pow(Math.max(r(),Number.MIN_VALUE),1/k);
    const d=k-1/3,c=1/Math.sqrt(9*d);
    for(;;){const x=normal(),u=r(),t=1+c*x;if(t<=0)continue;const v=t*t*t;
      if(u<1-0.0331*x*x*x*x||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v;}};
  const x=gamma(a),y=gamma(b);return x/(x+y);
};`;
const betaLine=source.split('\n').find(l=>l.trimStart().startsWith('const beta ='));
assert.ok(betaLine);
const variants={
 original,
 observed_open_only:await load(replaceOnce(source,'if (p.opp && !yielded.includes(id))','if (open && !yielded.includes(id))')),
 all_seen_revisitable:await load(replaceOnce(source,'if (p.opp && !yielded.includes(id))','if (!yielded.includes(id))')),
 exact_beta:await load(replaceOnce(source,betaLine,gammaCode)),
};
// This is a diagnostic, not a new recommended brain: controls for omission of any reward learning.
const randomPolicy=(rate=0)=>({name:'random'+rate,session(){},learn(){},choose:s=>{
 const eligible=s.yielded.filter(p=>s.now-s.lastFetch.get(p)>=120);
 if(eligible.length&&s.r()<rate)return eligible[Math.floor(s.r()*eligible.length)];
 const ids=[...s.frontier.keys()];return ids.length?ids[Math.floor(s.r()*ids.length)]:eligible[0]??null;
}});
const stats=xs=>{const mean=xs.reduce((a,b)=>a+b,0)/xs.length,sd=Math.sqrt(xs.reduce((a,b)=>a+(b-mean)**2,0)/(xs.length-1)),se=sd/Math.sqrt(xs.length);
 const z=1.95996398454,d=xs.length-1,t=z+(z**3+z)/(4*d)+(5*z**5+16*z**3+3*z)/(96*d*d)+(3*z**7+19*z**5+17*z**3-15*z)/(384*d**3);
 return {mean,sd,se,ci95_t_approx:[mean-t*se,mean+t*se]};};
const metrics=['per100','afterChange','novel','reopened','revisits','entropy'];
function measure(api,alter=w=>w,seedOffset=worldSeedOffset){
 const rows={};const make={fixed:()=>api.policies.fixed(),forget:()=>api.policies.bandit({memory:false}),bandit:()=>api.policies.bandit(),activation:()=>api.policies.activation(),random:()=>randomPolicy(),random28:()=>randomPolicy(.28)};
 for(const [name,f]of Object.entries(make)){rows[name]=[];for(let s=1;s<=runs;s++)rows[name].push(api.run(alter(api.makeWorld(seedOffset+s,budget)),f(),{seed:s}));}
 const paired={};for(const [a,b]of [['bandit','fixed'],['bandit','forget'],['bandit','random'],['bandit','random28']])paired[a+'-'+b]=Object.fromEntries(metrics.map(k=>[k,stats(rows[a].map((x,i)=>x[k]-rows[b][i][k]))]));
 return {means:Object.fromEntries(Object.entries(rows).map(([n,rs])=>[n,Object.fromEntries(metrics.map(k=>[k,stats(rs.map(r=>r[k]))]))])),paired,rows};
}
// Hidden family is evaluator-only; relabel all incoming anchors independently of target.
// Keep page graph, latent opportunities, closures and time budget identical.
const neutral=w=>{const r=original.rng(234567);for(const p of w.pages)for(const l of p.links)l.word='word'+Math.floor(r()*30);return w;};
// Kill the pre-planted advantage: closed opportunities stay closed; ordinary pages/links remain.
// This isolates manufactured change rewards, not a representative real-world generator.
const stationary=w=>{for(const p of w.pages)if(p.opp)p.opp.open=p.opp.open[0]>0?[budget,budget]:[0,budget];return w;};
const scenarios={};
for(const [n,api]of Object.entries(variants))scenarios[n]=measure(api);
scenarios.neutral_anchors=measure(original,neutral);
scenarios.stationary=measure(original,stationary);
// Direct observation-boundary counterexample: identical false 'open' signals yield different revisit eligibility.
function spy(opp){let atOne;const policy={session(){},learn(){},choose:s=>{if(s.now===1)atOne=s.yielded.includes(0);return 0;}};
 original.run({pages:[{id:0,fam:'council',links:[],opp}],seeds:[{to:0,word:'same'}],half:5,budget:10},policy);return atOne;}
assert.equal(spy(null),false);assert.equal(spy({id:0,open:[5,10]}),true);
// Isolate E0's Beta sampler exactly as implemented, not a Monte Carlo claim about all bandits.
const sampledBeta=(r,a,b)=>{const g=k=>{let x=0;for(let i=0;i<k;i++)x-=Math.log(r());return x;};const x=g(Math.min(a,30)),y=g(Math.min(b,30));return x/(x+y);};
const br=original.rng(79),n=40000;
const betaDiagnostics=[[45,10],[1.2,2.2]].map(([a,b])=>{let sum=0;for(let i=0;i<n;i++)sum+=sampledBeta(br,a,b);return {a,b,expectedBetaMean:a/(a+b),sampleMean:sum/n};});
// An explicit counterworld for delayed reward: one seed reveals a small immediate payoff group and a
// zero-direct-payoff chain leading to a large payoff group. This is deliberately constructed by Codex,
// not evidence of real discovery. Long-horizon promise is not visible from anchors.
function delayedWorld(depth=24){
 const pages=[],add=(fam,opp=false)=>{const id=pages.length;pages.push({id,fam,links:[],opp:opp?{id,open:[0,300]}:null});return id;};
 const root=add('hub'),easy=Array.from({length:12},()=>add('easy',true)),chain=Array.from({length:depth},()=>add('bridge')),treasure=Array.from({length:160},()=>add('novel',true));
 for(const e of easy)pages[root].links.push({to:e,word:'apply'});
 pages[root].links.push({to:chain[0],word:'bridge'});
 for(let i=0;i<chain.length;i++)pages[chain[i]].links=i+1<chain.length?[{to:chain[i+1],word:'bridge'}]:treasure.map(to=>({to,word:'treasure'}));
 return {pages,seeds:[{to:root,word:'seed'}],half:150,budget:300};
}
const delayed={};for(const [n,f]of Object.entries({fixed:()=>original.policies.fixed(),bandit:()=>original.policies.bandit(),random:()=>randomPolicy()})){const rs=[];for(let s=1;s<=runs;s++)rs.push(original.run(delayedWorld(),f(),{seed:s}));delayed[n]={unique:stats(rs.map(r=>r.unique)),revisits:stats(rs.map(r=>r.revisits)),rows:rs};}
console.log(JSON.stringify({sourceSha256:createHash('sha256').update(source).digest('hex'),runs,budget,worldSeedOffset,notes:{intervals:'Student-t quantile expansion times paired-world SE, descriptive approximations; 20 worlds are not a representative population; multiple comparisons exploratory',policyRandomness:'worlds paired, policy random streams not coupled',revisitControl:'random28 tuned diagnostically to original approximate revisit frequency; not an unbiased benchmark winner'},hiddenEligibilityLeak:true,betaDiagnostics,scenarios,delayed},null,2));
