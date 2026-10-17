import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initRisk, consumeLimit, claimTrial, acquireGeneration, sourceKey, readJsonLimited } from '../server/risk.mjs';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';
function fixture(t) {
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 const db={prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return stmt;},async batch(statements){const results=[];for(const stmt of statements)results.push(await stmt.run());return results;}};
 return {db,sqlite};
}
test('durable counter is atomic across races, expires, and cannot be bypassed by a new isolate',async t=>{
 const {db}=fixture(t);await initRisk(db);
 const outcomes=await Promise.all(Array.from({length:30},()=>consumeLimit(db,'bounded',5,1000,1,100)));
 assert.equal(outcomes.filter(Boolean).length,5);__resetEdgeRateLimits();
 assert.equal(await consumeLimit(db,'bounded',5,1000,1,200),false);
 assert.equal(await consumeLimit(db,'bounded',5,1000,1,1001),true);
 assert.equal(await consumeLimit(db,'oversized',4,1000,5),false);
});
test('guest and registration share one trial pool and site-wide grants are bounded',async t=>{
 const {db}=fixture(t);await initRisk(db);
 assert.equal(await claimTrial(db,'same-source',4),4);assert.equal(await claimTrial(db,'same-source',4),0);
 let total=4;for(let n=0;n<30;n++)total+=await claimTrial(db,'source-'+n,4);
 assert.equal(total,100);assert.equal(await claimTrial(db,'disabled',4,false),0);
});
test('IPv6 privacy addresses and alternate representations share a source key',async()=>{
 const key=ip=>sourceKey(new Request('https://example.com',{headers:{'CF-Connecting-IP':ip}}));
 assert.equal(await key('2001:db8:1234:5678::1'),await key('2001:0db8:1234:5678:abcd:0000:0000:2'));
 assert.notEqual(await key('192.0.2.1'),await key('192.0.2.2'));
});
test('generation lease limits user and site concurrency, release and stale recovery',async t=>{
 const {db,sqlite}=fixture(t);await initRisk(db);
 const user={id:'owner',plan:'pro'};const first=await acquireGeneration(db,user,'source',1);const second=await acquireGeneration(db,user,'source',1);
 assert.ok(first.id);assert.ok(second.id);assert.ok((await acquireGeneration(db,user,'source',1)).error);
 const third=await acquireGeneration(db,{id:'other',plan:'pro'},'other',1);const fourth=await acquireGeneration(db,{id:'another',plan:'pro'},'other',1);
 assert.ok(third.id);assert.ok(fourth.id);assert.ok((await acquireGeneration(db,{id:'last',plan:'pro'},'other',1)).error);
 await first.release();assert.ok((await acquireGeneration(db,user,'source',1)).id);
 sqlite.exec('UPDATE generation_leases SET expires_at = 0');assert.ok((await acquireGeneration(db,user,'source',1)).id);
});
test('safety budget counts refunded/failed attempts, kill switch rejects without a lease',async t=>{
 const {db,sqlite}=fixture(t);await initRisk(db);
 const user={id:'owner',plan:'free'}, env={MAX_DAILY_GENERATION_CREDITS:'4'};
 const first=await acquireGeneration(db,user,'source',4,env);assert.ok(first.id);await first.release();
 assert.ok((await acquireGeneration(db,user,'source',4,env)).error);
 assert.ok((await acquireGeneration(db,user,'source',1,{GENERATION_ENABLED:'false'})).error);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM generation_leases').get().n,0);
});
test('chunked JSON body limits apply without Content-Length',async()=>{
 const request=new Request('https://example.com',{method:'POST',body:'{"oversized":"'+ 'a'.repeat(100)+'"}'});
 await assert.rejects(readJsonLimited(request,20),RangeError);
 assert.deepEqual(await readJsonLimited(new Request('https://example.com',{method:'POST',body:'{"ok":true}'}),100),{ok:true});
});
test('edge rejects new guest after isolate reset, registration receives no second gift',async t=>{
 const {db}=fixture(t);const call=async(path,body)=>{
 const response=await onRequest({request:new Request('https://example.com/api/'+path,{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.42','Content-Type':'application/json'},body:JSON.stringify(body)}),env:{DB:db}});return {status:response.status,data:await response.json()};};
 const guest=await call('user/guest',{});assert.equal(guest.data.user.creditsBalance,4);
 __resetEdgeRateLimits();assert.equal((await call('user/guest',{})).status,429);
 const registered=await call('user/auth',{mode:'register',email:'synthetic@example.test',password:'test-password'});
 assert.equal(registered.status,200);assert.equal(registered.data.user.creditsBalance,0);
});

test('risk usage report requires administrator session and exposes bounded aggregate usage',async t=>{
 const {db}=fixture(t);const env={DB:db,ADMIN_PASSWORD:'isolated-risk-admin-password'};
 const call=(path,body,token)=>onRequest({request:new Request('https://example.com/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env});
 assert.equal((await call('admin/risk')).status,401);
 const login=await (await call('admin/login',{username:'admin',password:env.ADMIN_PASSWORD})).json();assert.ok(login.token);
 const response=await call('admin/risk',undefined,login.token);assert.equal(response.status,200);
 const report=await response.json();assert.equal(report.works.bytes,0);assert.equal(report.shares.bytes,0);
 assert.equal(report.works.limit+report.shares.limit,896*1024*1024);assert.equal(report.limits.totalDailyCredits,'1000');
 assert.equal(report.leases.count,0);assert.equal(report.limits.enabled,true);
});
