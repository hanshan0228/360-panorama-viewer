import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initRisk, consumeLimit, claimTrial, acquireGeneration, sourceKey, readJsonLimited, GENERATION_WORKFLOW_TIMEOUT_MS, GENERATION_LEASE_MS } from '../server/risk.mjs';
import { IMAGE_GENERATION_TIMEOUT_MS } from '../src/utils/imageModelRequest.mjs';
import { PANORAMA_REVIEW_TIMEOUT_MS } from '../server/panoramaQuality.mjs';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';
function fixture(t) {
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 const db={prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return stmt;},async batch(statements){const results=[];for(const stmt of statements)results.push(await stmt.run());return results;}};
 return {db,sqlite};
}

test('edge schema bootstrap is shared across overlapping requests and isolated by binding', async t => {
 const {db}=fixture(t);
 const prepared=t.mock.method(db,'prepare');
 const call=database=>onRequest({request:new Request('https://example.com/api/billing'),env:{DB:database}});
 const responses=await Promise.all([call(db),call(db),call(db)]);
 assert.deepEqual(responses.map(response=>response.status),[200,200,200]);
 await call(db);
 assert.equal(prepared.mock.calls.filter(call=>/CREATE TABLE IF NOT EXISTS users\s*\(/.test(call.arguments[0])).length,1);
 assert.equal(prepared.mock.calls.filter(call=>/ALTER TABLE users/.test(call.arguments[0])).length,0);
 const other=fixture(t);
 assert.equal((await call(other.db)).status,200);
 assert.ok(other.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='users'").get());
});

test('edge initialization and maintenance failures can be retried', async t => {
 const {db}=fixture(t);
 const original=db.batch.bind(db);
 let failure=true;
 t.mock.method(db,'batch',async statements=>{
   if(failure){failure=false;throw new Error('temporary database failure');}
   return original(statements);
 });
 const call=()=>onRequest({request:new Request('https://example.com/api/billing'),env:{DB:db}});
 assert.equal((await call()).status,500);
 assert.equal((await call()).status,200);
 // Expire the maintenance window, then fail that batch rather than the schema bootstrap.
 const future=Date.now()+60001;t.mock.method(Date,'now',()=>future);failure=true;
 assert.equal((await call()).status,500);
 assert.equal((await call()).status,200);
});

test('edge maintenance keeps running after initialization and preserves live sessions', async t => {
 const {db,sqlite}=fixture(t);let now=Date.now();t.mock.method(Date,'now',()=>now);
 const call=()=>onRequest({request:new Request('https://example.com/api/billing'),env:{DB:db}});
 await call();
 sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run('expired','owner',now-1);
 sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run('live','owner',now+3600000);
 sqlite.prepare('INSERT INTO risk_counters VALUES (?,?,?)').run('expired-counter',1,now-1);
 await call();
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get().n,2);
 now+=60001;await call();
 assert.deepEqual(sqlite.prepare('SELECT token FROM user_sessions').all().map(row=>row.token),['live']);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM risk_counters').get().n,0);
});

test('edge schema bootstrap migrates a legacy users table', async t => {
 const {db,sqlite}=fixture(t);sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
 const response=await onRequest({request:new Request('https://example.com/api/billing'),env:{DB:db}});
 assert.equal(response.status,200);
 assert.ok(sqlite.prepare('PRAGMA table_info(users)').all().some(column=>column.name==='password_hash'));
});

test('edge health does not advertise Stripe-only settings as a working payment gateway', async () => {
 const response=await onRequest({request:new Request('https://example.com/api/health'),env:{DB:{},STRIPE_SECRET_KEY:'synthetic',STRIPE_WEBHOOK_SECRET:'synthetic'}});
 const status=await response.json();
 assert.equal(status.paymentsReady,false);
 assert.equal(status.gateways.stripeConfigured,true);
});

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
test('generation lease covers the full workflow plus cleanup and only recovers after 270 seconds', async t => {
 const {db,sqlite}=fixture(t);await initRisk(db);
 let now=Date.now();const started=now;t.mock.method(Date,'now',()=>now);
 assert.equal(IMAGE_GENERATION_TIMEOUT_MS,150000);
 assert.equal(PANORAMA_REVIEW_TIMEOUT_MS,90000);
 assert.equal(GENERATION_WORKFLOW_TIMEOUT_MS,240000);
 assert.equal(GENERATION_LEASE_MS,270000);
 const user={id:'owner',plan:'pro'},env={MAX_CONCURRENT_GENERATIONS:1};
 const first=await acquireGeneration(db,user,'source',1,env);
 assert.equal(sqlite.prepare('SELECT expires_at FROM generation_leases WHERE id = ?').get(first.id).expires_at,started+270000);
 now=started+GENERATION_WORKFLOW_TIMEOUT_MS;
 assert.ok((await acquireGeneration(db,user,'source',1,env)).error);
 now=started+GENERATION_LEASE_MS-1;
 assert.ok((await acquireGeneration(db,user,'source',1,env)).error);
 now++;
 assert.ok((await acquireGeneration(db,user,'source',1,env)).id);
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
test('edge cannot mint guest credits even after an isolate reset', async t => {
 const {db,sqlite}=fixture(t);
 const call=()=>onRequest({request:new Request('https://example.com/api/user/guest',{method:'POST'}),env:{DB:db}});
 assert.equal((await call()).status,403);
 __resetEdgeRateLimits(); assert.equal((await call()).status,403);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
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
