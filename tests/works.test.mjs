import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { saveGeneratedWork, handleWorksRequest } from '../server/works.mjs';
const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVR42mNk+P+/HgAFhAJ/wRZeOQAAAABJRU5ErkJggg==';
function fixture(t) {
 const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
 sqlite.exec('CREATE TABLE users(id TEXT,status TEXT); CREATE TABLE user_sessions(token TEXT,user_id TEXT,expires_at INTEGER)');
 for(const id of ['owner','other','usr_guest_trial']) { sqlite.prepare('INSERT INTO users VALUES (?,?)').run(id,'active'); sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run(id,id,Date.now()+60000); }
 const db = {prepare(sql) { let args=[]; const stmt={bind(...values){args=values;return stmt;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};return stmt;}};
 const objects=new Map(); const storage={async put(k,v){objects.set(k,v);},async get(k){return objects.get(k)||null;},async delete(k){objects.delete(k);}};
 const save=(extra={})=>saveGeneratedWork({db,storage,user:{id:'owner'},imageUrl,prompt:'Synthetic test',model:'test',resolution:'4K',...extra});
 const call=(path='',token='owner',method='GET',body)=>handleWorksRequest({db,storage,request:new Request('https://example.com/api/works'+path,{method,headers:token?{Authorization:'Bearer '+token}:{},...(body===undefined?{}:{body})})});
 return {sqlite,db,storage,objects,save,call};
}
test('private library saves exact original and enforces account ownership and deletion',async t=>{
 const f=fixture(t);const saved=await f.save();assert.equal(saved.saved,true);
 const works=await (await f.call()).json();assert.equal(works.works.length,1);assert.equal(works.works[0].prompt,'Synthetic test');
 assert.equal((await f.call('/'+saved.id+'/original',null)).status,401);
 assert.equal((await f.call('/'+saved.id+'/original','other')).status,404);
 assert.equal((await f.call('','usr_guest_trial')).status,403);
 assert.equal((await (await f.call('/'+saved.id+'/original')).json()).imageUrl,imageUrl);
 assert.equal((await f.call('/'+saved.id,'other','POST')).status,404);
 f.storage.delete=async()=>{}; // stale KV must not bypass D1 ownership/deletion.
 assert.equal((await f.call('/'+saved.id,'owner','POST')).status,200);
 assert.ok(f.objects.size);assert.equal((await f.call('/'+saved.id+'/original')).status,404);
 assert.equal((await (await f.call()).json()).works.length,0);
 assert.equal((await f.call('/', 'owner')).status, 200);
});
test('guest and failed storage never claim a saved original',async t=>{
 const f=fixture(t);assert.equal((await f.save({user:{id:'usr_guest_trial'}})).saved,false);
 f.storage.put=async()=>{throw Error('storage unavailable');};assert.equal((await f.save()).saved,false);
 assert.equal((await (await f.call()).json()).works.length,0);assert.equal(f.objects.size,0);
});
test('chunked original is reassembled without compression, missing chunk fails safely',async t=>{
 const f=fixture(t);const large=imageUrl.replace(/=+$/,'')+'A'.repeat(5*1024*1024);
 const saved=await f.save({imageUrl:large});assert.equal(saved.saved,true);assert.equal(f.objects.size,2);
 assert.equal((await (await f.call('/'+saved.id+'/original')).json()).imageUrl,large);
 f.objects.delete('work:'+saved.id+':1');await assert.rejects((await f.call('/'+saved.id+'/original')).json());
});
test('library quota and unsupported assets reject without losing originals',async t=>{
 const f=fixture(t);let saved;
 for(let i=0;i<50;i++) {saved=await f.save();assert.equal(saved.saved,true);}
 assert.equal((await f.save()).saved,false);
 assert.equal((await f.call('/'+saved.id+'/thumbnail','owner','POST','not an image')).status,404);
 assert.equal((await f.call('/'+saved.id+'/original')).status,200);
});

test('private storage enforces personal and global byte limits before any KV write', async t => {
 const f=fixture(t);assert.equal((await f.save()).saved,true);
 f.sqlite.prepare('UPDATE panorama_works SET stored_bytes = ?').run(128*1024*1024);
 assert.equal((await f.save()).saved,false);assert.equal(f.objects.size,1);
 f.sqlite.prepare('UPDATE panorama_works SET stored_bytes = ?, owner_id = ?').run(768*1024*1024,'other');
 assert.equal((await f.save({user:{id:'owner',plan:'pro'}})).saved,false);assert.equal(f.objects.size,1);
});
test('failed physical deletion retains its byte reservation and denies access',async t=>{
 const f=fixture(t);const saved=await f.save();
 f.storage.delete=async()=>{throw Error('KV unavailable');};
 assert.equal((await f.call('/'+saved.id,'owner','POST')).status,200);
 assert.equal((await f.call('/'+saved.id+'/original')).status,404);
 const row=f.sqlite.prepare('SELECT stored_bytes FROM panorama_works WHERE id = ?').get(saved.id);
 assert.ok(row.stored_bytes>0);
});
test('legacy originals migrate conservatively without deleting or changing image bytes',async t=>{
 const f=fixture(t);const saved=await f.save();
 f.sqlite.exec('ALTER TABLE panorama_works DROP COLUMN stored_bytes');
 assert.equal((await (await f.call('/'+saved.id+'/original')).json()).imageUrl,imageUrl);
 assert.equal(f.sqlite.prepare('SELECT stored_bytes FROM panorama_works').get().stored_bytes,64*1024*1024);
});
