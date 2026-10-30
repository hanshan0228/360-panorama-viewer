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
test('reservation response loss cleans only a confirmed matching unfinished row before KV writes',async t=>{
 for(const scenario of ['committed','not committed','read failure','foreign owner','ready','changed after read','delete failure']) {
   await t.test(scenario,async t=>{
     const f=fixture(t);const prepare=f.db.prepare;let sessions=0,puts=0,deletes=0;
     f.db.withSession=mode=>{assert.equal(mode,'first-primary');sessions++;return f.db;};
     f.storage.put=async()=>{puts++;};f.storage.delete=async()=>{deletes++;};
     f.db.prepare=sql=>{
       const stmt=prepare(sql);
       if(sql.startsWith('INSERT INTO panorama_works')) {
         const run=stmt.run;stmt.run=async()=>{
           if(scenario!=='not committed') await run();
           if(scenario==='foreign owner') f.sqlite.prepare("UPDATE panorama_works SET owner_id = 'other'").run();
           if(scenario==='ready') f.sqlite.prepare('UPDATE panorama_works SET ready = 1').run();
           throw Error('reservation response lost');
         };
       }
       if(sql.startsWith('SELECT owner_id, ready, deleted_at, created_at FROM panorama_works')) {
         const first=stmt.first;stmt.first=async()=>{
           if(scenario==='read failure') throw Error('primary unavailable');
           const row=await first();
           if(scenario==='changed after read') f.sqlite.prepare('UPDATE panorama_works SET ready = 1').run();
           return row;
         };
       }
       if(scenario==='delete failure' && sql.startsWith('DELETE FROM panorama_works WHERE id = ? AND owner_id = ?')) stmt.run=async()=>{throw Error('delete unavailable');};
       return stmt;
     };
     assert.equal((await f.save()).saved,false);assert.equal(sessions,2);
     assert.equal(puts,0);assert.equal(deletes,0);
     const row=f.sqlite.prepare('SELECT * FROM panorama_works').get();
     if(['committed','not committed'].includes(scenario)) assert.equal(row,undefined);
     else {assert.ok(row.stored_bytes>0);assert.equal(row.owner_id,scenario==='foreign owner'?'other':'owner');assert.equal(row.ready,Number(['ready','changed after read'].includes(scenario)));}
   });
 }
});
test('reservation retry after tombstone cleanup reconciles a lost insert response',async t=>{
 const f=fixture(t);const old=await f.save();
 f.sqlite.prepare('UPDATE panorama_works SET deleted_at = 1, stored_bytes = ? WHERE id = ?').run(128*1024*1024,old.id);
 const prepare=f.db.prepare;let attempts=0,puts=0;f.storage.put=async()=>{puts++;};
 f.db.prepare=sql=>{
   const stmt=prepare(sql);
   if(sql.startsWith('INSERT INTO panorama_works')) {const run=stmt.run;stmt.run=async()=>{const result=await run();if(++attempts===2) throw Error('response lost');return result;};}
   return stmt;
 };
 assert.equal((await f.save()).saved,false);assert.equal(attempts,2);assert.equal(puts,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM panorama_works WHERE deleted_at IS NULL').get().count,0);
 assert.equal(f.sqlite.prepare('SELECT stored_bytes FROM panorama_works WHERE id = ?').get(old.id).stored_bytes,0);
});
test('a committed completion with a lost response is confirmed on a fresh primary session',async t=>{
 const f=fixture(t);const prepare=f.db.prepare;let sessions=0;
 f.db.withSession=mode=>{assert.equal(mode,'first-primary');sessions++;return f.db;};
 f.db.prepare=sql=>{
   const stmt=prepare(sql);
   if(sql.startsWith('UPDATE panorama_works SET ready = 1')) {
     const run=stmt.run;stmt.run=async()=>{await run();throw Error('response lost');};
   }
   return stmt;
 };
 const saved=await f.save();assert.equal(saved.saved,true);assert.equal(sessions,2);
 assert.equal((await (await f.call('/'+saved.id+'/original')).json()).imageUrl,imageUrl);
 assert.ok(f.sqlite.prepare('SELECT stored_bytes FROM panorama_works WHERE id = ?').get(saved.id).stored_bytes>0);
});
test('an unconfirmed completion preserves the row and original whether the update committed or not',async t=>{
 for(const committed of [false,true]) {
   const f=fixture(t);const prepare=f.db.prepare;
   f.db.prepare=sql=>{
     const stmt=prepare(sql);
     if(sql.startsWith('UPDATE panorama_works SET ready = 1')) {
       const run=stmt.run;stmt.run=async()=>{if(committed) await run();throw Error('completion unavailable');};
     }
     if(sql.startsWith('SELECT ready, deleted_at FROM panorama_works')) stmt.first=async()=>{throw Error('primary unavailable');};
     return stmt;
   };
   assert.equal((await f.save()).saved,false);
   const row=f.sqlite.prepare('SELECT * FROM panorama_works').get();
   assert.equal(row.ready,Number(committed));assert.equal(row.deleted_at,null);assert.ok(row.stored_bytes>0);
   assert.equal(f.objects.get('work:'+row.id+':0'),imageUrl.split(',')[1]);
 }
});
test('a completion error confirmed as unfinished keeps the reservation for reconciliation',async t=>{
 const f=fixture(t);const prepare=f.db.prepare;
 f.db.prepare=sql=>{
   const stmt=prepare(sql);
   if(sql.startsWith('UPDATE panorama_works SET ready = 1')) stmt.run=async()=>{throw Error('completion unavailable');};
   return stmt;
 };
 assert.equal((await f.save()).saved,false);
 const row=f.sqlite.prepare('SELECT * FROM panorama_works').get();
 assert.equal(row.ready,0);assert.equal(row.deleted_at,null);assert.ok(row.stored_bytes>0);
 assert.equal(f.objects.get('work:'+row.id+':0'),imageUrl.split(',')[1]);
});
test('a synchronous failure starting reconciliation also preserves the original',async t=>{
 const f=fixture(t);const prepare=f.db.prepare;
 f.db.prepare=sql=>{
   if(sql.startsWith('SELECT ready, deleted_at FROM panorama_works')) throw Error('primary unavailable');
   const stmt=prepare(sql);
   if(sql.startsWith('UPDATE panorama_works SET ready = 1')) stmt.run=async()=>{throw Error('completion unavailable');};
   return stmt;
 };
 assert.equal((await f.save()).saved,false);
 const row=f.sqlite.prepare('SELECT * FROM panorama_works').get();
 assert.equal(row.ready,0);assert.equal(row.deleted_at,null);assert.ok(row.stored_bytes>0);
 assert.equal(f.objects.get('work:'+row.id+':0'),imageUrl.split(',')[1]);
});
test('completion that lost its reservation does not report success or delete data',async t=>{
 const f=fixture(t);const put=f.storage.put;
 f.storage.put=async(key,value)=>{await put(key,value);f.sqlite.prepare('UPDATE panorama_works SET deleted_at = ?').run(123);};
 assert.equal((await f.save()).saved,false);
 const row=f.sqlite.prepare('SELECT * FROM panorama_works').get();
 assert.equal(row.ready,0);assert.equal(row.deleted_at,123);assert.ok(row.stored_bytes>0);
 assert.equal(f.objects.get('work:'+row.id+':0'),imageUrl.split(',')[1]);
});
test('failed cleanup claim preserves the reservation and any written chunks',async t=>{
 const f=fixture(t);const large=imageUrl.replace(/=+$/,'')+'A'.repeat(5*1024*1024);
 const put=f.storage.put;f.storage.put=async(key,value)=>{if(key.endsWith(':1')) throw Error('write failed');await put(key,value);};
 const prepare=f.db.prepare;f.db.prepare=sql=>{
   const stmt=prepare(sql);
   if(sql.startsWith('UPDATE panorama_works SET deleted_at = ? WHERE id = ? AND ready = 0')) stmt.run=async()=>{throw Error('claim unavailable');};
   return stmt;
 };
 assert.equal((await f.save({imageUrl:large})).saved,false);
 const row=f.sqlite.prepare('SELECT * FROM panorama_works').get();
 assert.equal(row.ready,0);assert.equal(row.deleted_at,null);assert.ok(row.stored_bytes>0);
 assert.ok(f.objects.has('work:'+row.id+':0'));
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
 assert.equal((await f.call('/'+saved.id+'/thumbnail','owner','POST','not an image')).status,400);
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
test('capacity recovery retries tombstones and releases bytes only after every KV deletion succeeds',async t=>{
 const f=fixture(t);const large=imageUrl.replace(/=+$/,'')+'A'.repeat(5*1024*1024);
 const deleted=await f.save({imageUrl:large});const active=await f.save();
 f.sqlite.prepare('UPDATE panorama_works SET stored_bytes = ? WHERE id = ?').run(128*1024*1024,deleted.id);
 const remove=f.storage.delete;
 f.storage.delete=async key=>{if(key.endsWith(':1')) throw Error('KV unavailable');await remove(key);};
 assert.equal((await f.call('/'+deleted.id,'owner','POST')).status,200);
 assert.equal((await f.save()).saved,false);
 assert.equal(f.sqlite.prepare('SELECT stored_bytes FROM panorama_works WHERE id = ?').get(deleted.id).stored_bytes,128*1024*1024);
 assert.ok(f.objects.has('work:'+deleted.id+':1'));
 assert.equal((await (await f.call('/'+active.id+'/original')).json()).imageUrl,imageUrl);
 f.storage.delete=remove;
 assert.equal((await f.save()).saved,true);
 assert.equal(f.sqlite.prepare('SELECT stored_bytes FROM panorama_works WHERE id = ?').get(deleted.id).stored_bytes,0);
 assert.equal(f.objects.has('work:'+deleted.id+':1'),false);
 assert.equal((await f.call('/'+deleted.id+'/original')).status,404);
});
test('legacy originals migrate conservatively without deleting or changing image bytes',async t=>{
 const f=fixture(t);const saved=await f.save();
 f.sqlite.exec('ALTER TABLE panorama_works DROP COLUMN stored_bytes');
 assert.equal((await (await f.call('/'+saved.id+'/original')).json()).imageUrl,imageUrl);
 assert.equal(f.sqlite.prepare('SELECT stored_bytes FROM panorama_works').get().stored_bytes,64*1024*1024);
});

test('private thumbnails migrate legacy schema, stay owner-only, and are cleared on deletion',async t=>{
 const f=fixture(t); const saved=await f.save();
 f.sqlite.exec('ALTER TABLE panorama_works DROP COLUMN thumbnail');
 assert.equal((await (await f.call()).json()).works[0].thumbnail,null);
 const body=JSON.stringify({thumbnail:imageUrl});
 assert.equal((await f.call('/'+saved.id+'/thumbnail',null,'POST',body)).status,401);
 assert.equal((await f.call('/'+saved.id+'/thumbnail','other','POST',body)).status,404);
 assert.equal((await f.call('/'+saved.id+'/thumbnail','owner','POST',body)).status,200);
 assert.equal((await (await f.call()).json()).works[0].thumbnail,imageUrl);
 assert.deepEqual((await (await f.call('','other')).json()).works,[]);
 assert.equal((await f.call('/'+saved.id,'owner','POST')).status,200);
 assert.equal(f.sqlite.prepare('SELECT thumbnail FROM panorama_works WHERE id = ?').get(saved.id).thumbnail,null);
 assert.equal((await f.call('/'+saved.id+'/thumbnail','owner','POST',body)).status,404);
});

test('thumbnail validation and streaming body limit preserve existing images and original read quota',async t=>{
 const f=fixture(t);const saved=await f.save();const path='/'+saved.id+'/thumbnail';
 const body=JSON.stringify({thumbnail:imageUrl});
 assert.equal((await f.call(path,'owner','POST',body)).status,200);
 const largeHeader=Buffer.from(imageUrl.split(',')[1],'base64');largeHeader.writeUInt32BE(513,16);
 for (const invalid of [JSON.stringify({thumbnail:'data:image/svg+xml;base64,PHN2Zz4='}), JSON.stringify({thumbnail:imageUrl.replace('image/png','image/jpeg')}), JSON.stringify({thumbnail:'data:image/png;base64,'+largeHeader.toString('base64')}), '{']) {
   assert.equal((await f.call(path,'owner','POST',invalid)).status,400);
 }
 assert.equal((await f.call(path,'owner','POST',JSON.stringify({thumbnail:'x'.repeat(32*1024)}))).status,413);
 const oversized=new Request('https://example.com/api/works'+path,{method:'POST',headers:{Authorization:'Bearer owner','Content-Length':'32769'},body:'{}'});
 assert.equal((await handleWorksRequest({db:f.db,storage:f.storage,request:oversized})).status,413);
 for(let i=0;i<45;i++) assert.equal((await f.call()).status,200);
 assert.equal((await (await f.call()).json()).works[0].thumbnail,imageUrl);
 for(let i=0;i<40;i++) assert.equal((await f.call('/'+saved.id+'/original')).status,200);
 assert.equal((await f.call('/'+saved.id+'/original')).status,429);
 assert.equal((await f.call(path,'owner','POST',body)).status,409);
 assert.equal(f.objects.get('work:'+saved.id+':0'),imageUrl.split(',')[1]);
});

test('thumbnail stream and database failures leave the existing images intact',async t=>{
 const f=fixture(t);const saved=await f.save();const path='/'+saved.id+'/thumbnail';
 const body=JSON.stringify({thumbnail:imageUrl});
 assert.equal((await f.call(path,'owner','POST',body)).status,200);
 const stream=new ReadableStream({pull(controller){controller.error(new Error('broken stream'));}});
 const request=new Request('https://example.com/api/works'+path,{method:'POST',headers:{Authorization:'Bearer owner'},body:stream,duplex:'half'});
 assert.equal((await handleWorksRequest({db:f.db,storage:f.storage,request})).status,503);
 const another=await f.save();
 f.sqlite.exec("CREATE TRIGGER fail_thumbnail BEFORE UPDATE OF thumbnail ON panorama_works BEGIN SELECT RAISE(FAIL, 'unavailable'); END");
 assert.equal((await f.call('/'+another.id+'/thumbnail','owner','POST',body)).status,503);
 assert.equal((await (await f.call()).json()).works.find(work=>work.id===saved.id).thumbnail,imageUrl);
 assert.equal((await (await f.call('/'+saved.id+'/original')).json()).imageUrl,imageUrl);
});

test('thumbnail site budget and one-time writes are atomic and deletion releases capacity',async t=>{
 const f=fixture(t);const seed=await f.save();const first=await f.save();const second=await f.save();
 const limit=16*1024*1024;
 f.sqlite.prepare('UPDATE panorama_works SET thumbnail = ? WHERE id = ?').run('x'.repeat(limit-imageUrl.length),seed.id);
 const body=JSON.stringify({thumbnail:imageUrl});
 const paths=[first,second].map(work=>'/'+work.id+'/thumbnail');
 const results=await Promise.all(paths.map(path=>f.call(path,'owner','POST',body)));
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 assert.equal(f.sqlite.prepare('SELECT SUM(length(CAST(thumbnail AS BLOB))) AS bytes FROM panorama_works').get().bytes,limit);
 const winner=paths[results.findIndex(result=>result.status===200)];
 const loser=paths[results.findIndex(result=>result.status===409)];
 assert.equal((await f.call(winner,'owner','POST',body)).status,409);
 assert.equal((await f.call('/'+seed.id,'owner','POST')).status,200);
 assert.equal((await f.call(loser,'owner','POST',body)).status,200);
 assert.equal(f.sqlite.prepare('SELECT SUM(length(CAST(thumbnail AS BLOB))) AS bytes FROM panorama_works').get().bytes,2*imageUrl.length);
 const third=await f.save();const same='/'+third.id+'/thumbnail';
 const simultaneous=await Promise.all([f.call(same,'owner','POST',body),f.call(same,'owner','POST',body)]);
 assert.deepEqual(simultaneous.map(result=>result.status).sort(),[200,409]);
});
