// Actual SDKs against generated loopback fixtures; no cloud service, keys or data.
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { writeFile, readFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
const uid='00000000-0000-4000-8000-000000000001', ha='00000000-0000-4000-8000-000000000011', hb='00000000-0000-4000-8000-000000000022';
const anon='home6-generated-public-anon';
const jwt=label=>[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,fixture:label})).toString('base64url'),'generated-signature'].join('.');
const tokens={one:jwt('one'),two:jwt('two')};
const user={id:uid,aud:'authenticated',role:'authenticated',email:'migration@example.test',app_metadata:{},user_metadata:{}};
const session=label=>({access_token:tokens[label],refresh_token:`refresh-${label}`,token_type:'bearer',expires_in:3600,user});
const transcript='Generierte Testaufnahme';
let operation='initialise';const requests=[];
const normalAuth=value=>value===`Bearer ${tokens.one}`?'Bearer generated-user-one':value===`Bearer ${tokens.two}`?'Bearer generated-user-two':value;
async function bodyOf(req){
 const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts),type=req.headers['content-type']||'';
 if(type.includes('application/json'))return bytes.length?JSON.parse(bytes.toString()):null;
 if(type.includes('multipart/form-data')){const form=await new Response(bytes,{headers:{'content-type':type}}).formData();const fields=[];for(const [key,value] of form.entries())fields.push(typeof value==='string'?[key,value]:[key,{name:value.name,type:value.type,bytes:Buffer.from(await value.arrayBuffer()).toString('base64')}]);return fields.sort(([a],[b])=>a.localeCompare(b));}
 return bytes.length?bytes.toString('base64'):null;
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture'),body=await bodyOf(req);
  if(!url.pathname.startsWith('/v1/'))assert.equal(req.headers.apikey,anon,'Supabase API key header must survive SDK upgrades');
  requests.push({operation,method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),authorization:normalAuth(req.headers.authorization),body});
  const send=(status,payload)=>{res.writeHead(status,{'content-type':'application/json','x-supabase-api-version':'2024-01-01'});res.end(status===204?'':JSON.stringify(payload));};
  if(url.pathname==='/auth/v1/token'){if(body.refresh_token==='invalid-fixture')return send(400,{code:'refresh_token_not_found',msg:'Invalid Refresh Token: Refresh Token Not Found'});return send(200,session(url.searchParams.get('grant_type')==='refresh_token'?'two':'one'));}
  if(url.pathname==='/auth/v1/recover')return send(200,{});
  if(url.pathname==='/auth/v1/logout')return send(204);
  if(url.pathname==='/auth/v1/user')return send(200,user);
  if(url.pathname==='/rest/v1/rpc/get_household_context')return send(200,[{household_id:hb,role:'admin'}]);
  if(url.pathname.startsWith('/rest/v1/'))return send(req.method==='POST'?201:200,[]);
  if(url.pathname==='/storage/v1/object/documents/fixture/receipt.txt'){assert.equal(req.headers['x-upsert'],'false');return send(200,{Key:'documents/fixture/receipt.txt',Id:uid});}
  if(url.pathname==='/storage/v1/object/sign/documents/fixture/receipt.txt')return send(200,{signedURL:'/object/sign/documents/fixture/receipt.txt?token=generated-signature'});
  if(url.pathname==='/functions/v1/ki-chat')return send(200,{choices:[{message:{content:'[]'}}]});
  if(url.pathname==='/functions/v1/failing-fixture')return send(429,{error:'Generated limit'});
  if(url.pathname==='/v1/audio/transcriptions')return send(200,{text:transcript});
  if(url.pathname==='/v1/chat/completions'){if(body.model==='fixture-error')return send(401,{error:{message:'Generated invalid key',type:'authentication_error',code:'invalid_api_key'}});return send(200,{id:'generated-chat',choices:[{message:{role:'assistant',content:'[]'},finish_reason:'stop'}]});}
  send(404,{error:'Unexpected fixture route',path:url.pathname});
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
process.env.REACT_APP_SUPABASE_URL=base;process.env.REACT_APP_SUPABASE_ANON_KEY=anon;
const values=new Map(),previousWindow=globalThis.window;
globalThis.window={localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
const clients=[];
try{
 const {supabase,setActiveHouseholdId}=await import('../src/supabaseClient.js');clients.push(supabase);
 const events=[];const {data:listener}=supabase.auth.onAuthStateChange(event=>events.push(event));
 operation='login';const login=await supabase.auth.signInWithPassword({email:user.email,password:'Generated-password-123'});assert.equal(login.error,null);assert.equal(login.data.user.id,uid);assert.equal((await supabase.auth.getSession()).data.session.access_token,tokens.one);
 operation='refresh';const refresh=await supabase.auth.refreshSession();assert.equal(refresh.error,null);assert.equal(refresh.data.session.access_token,tokens.two);
 operation='reset';assert.equal((await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:'https://app.example.test/update-password'})).error,null);
 setActiveHouseholdId(ha);operation='household-read';await supabase.from('home_objekte').select('id,name').eq('user_id',uid);assert.equal(requests.at(-1).query.household_id,`eq.${ha}`);assert.equal(requests.at(-1).query.user_id,undefined);assert.equal(requests.at(-1).authorization,'Bearer generated-user-two');
 const input={user_id:uid,name:'Generated object'};
 operation='household-insert';await supabase.from('home_objekte').insert(input).select();assert.equal(requests.at(-1).body.household_id,ha);assert.equal(input.household_id,undefined);
 operation='household-upsert';await supabase.from('home_objekte').upsert(input);assert.equal(requests.at(-1).body.household_id,ha);
 operation='household-update';await supabase.from('home_objekte').update({name:'Generated replacement'}).eq('user_id',uid);assert.equal(requests.at(-1).query.household_id,`eq.${ha}`);
 operation='household-in';await supabase.from('home_objekte').select('id').in('user_id',[uid]);assert.ok(requests.at(-1).query.household_id.includes(ha));
 setActiveHouseholdId(hb);operation='household-switch';await supabase.from('home_objekte').select('id').eq('user_id',uid);assert.equal(requests.at(-1).query.household_id,`eq.${hb}`);
 operation='unshared-read';await supabase.from('profiles').select('id').eq('user_id',uid);assert.equal(requests.at(-1).query.user_id,`eq.${uid}`);assert.equal(requests.at(-1).query.household_id,undefined);
 operation='rpc';const rpc=await supabase.rpc('get_household_context',{});assert.equal(rpc.error,null);assert.equal(rpc.data[0].household_id,hb);
 operation='storage-upload';const upload=await supabase.storage.from('documents').upload('fixture/receipt.txt',new Blob(['generated receipt'],{type:'text/plain'}),{contentType:'text/plain',upsert:false});assert.equal(upload.error,null);assert.equal(upload.data.path,'fixture/receipt.txt');
 operation='storage-sign';const signed=await supabase.storage.from('documents').createSignedUrl('fixture/receipt.txt',60);assert.equal(signed.error,null);assert.match(signed.data.signedUrl,/generated-signature/);assert.equal(supabase.storage.from('documents').getPublicUrl('fixture/receipt.txt').data.publicUrl,base+'/storage/v1/object/public/documents/fixture/receipt.txt');
 operation='edge-success';const edge=await supabase.functions.invoke('ki-chat',{body:{model:'gpt-4o',messages:[{role:'user',content:'Generated fixture'}]}});assert.equal(edge.error,null);assert.equal(edge.data.choices[0].message.content,'[]');
 operation='edge-error';const failed=await supabase.functions.invoke('failing-fixture',{body:{fixture:true}});assert.equal(failed.error.context.status,429);
 const channel=supabase.channel('home6-fixture').on('postgres_changes',{event:'*',schema:'public',table:'home_objekte',filter:`household_id=eq.${hb}`},()=>{});assert.equal(supabase.getChannels().length,1);await supabase.removeChannel(channel);assert.equal(supabase.getChannels().length,0);
 operation='logout';assert.equal((await supabase.auth.signOut({scope:'local'})).error,null);assert.equal((await supabase.auth.getSession()).data.session,null);assert.ok(events.includes('SIGNED_IN'));assert.ok(events.includes('TOKEN_REFRESHED'));assert.ok(events.includes('SIGNED_OUT'));listener.subscription.unsubscribe();setActiveHouseholdId(null);assert.equal(values.has('__active_household_id'),false);
 operation='invalid-refresh';const invalid=await supabase.auth.refreshSession({refresh_token:'invalid-fixture'});assert.equal(invalid.error.status,400);assert.match(invalid.error.message,/Invalid Refresh Token/);
 const state=new Map();const storage={getItem:k=>state.get(k)??null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};const options={auth:{storage,storageKey:'home6-auth-fixture',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}};
 const first=createClient(base,anon,options);clients.push(first);operation='persisted-login';await first.auth.signInWithPassword({email:user.email,password:'Generated-password-123'});const second=createClient(base,anon,options);clients.push(second);assert.equal((await second.auth.getSession()).data.session.access_token,tokens.one);
 operation='persisted-logout';await first.auth.signOut({scope:'local'});assert.equal((await second.auth.getSession()).data.session,null);
 // Load the actual serialization emitted by the previously accepted SDK.
 const legacyFixture=JSON.parse(await readFile(new URL('./fixtures/supabase-session-v2.json',import.meta.url),'utf8'));
 const legacyState=new Map(Object.entries(legacyFixture.storage));
 const legacy=createClient(base,anon,{auth:{storage:{getItem:k=>legacyState.get(k)??null,setItem:(k,v)=>legacyState.set(k,v),removeItem:k=>legacyState.delete(k)},autoRefreshToken:false,detectSessionInUrl:false}});clients.push(legacy);
 const restored=await legacy.auth.getSession();assert.equal(restored.error,null);assert.equal(restored.data.session.user.id,legacyFixture.userId);
 operation='legacy-refresh';const legacyRefresh=await legacy.auth.refreshSession();assert.equal(legacyRefresh.error,null);assert.equal(legacyRefresh.data.session.access_token,tokens.two);assert.equal(requests.at(-1).body.refresh_token,'refresh-one');
 operation='legacy-logout';await legacy.auth.signOut({scope:'local'});assert.equal((await legacy.auth.getSession()).data.session,null);
 const openai=new OpenAI({apiKey:'generated-not-a-real-key',baseURL:base+'/v1',dangerouslyAllowBrowser:true,maxRetries:0});
 operation='openai-audio';const audio=await openai.audio.transcriptions.create({file:new File([new Uint8Array([1,2,3,4])],'aufnahme.webm',{type:'audio/webm'}),model:'whisper-1'});assert.equal(audio.text,transcript);
 operation='openai-chat';const chat=await openai.chat.completions.create({model:'gpt-4o',messages:[{role:'user',content:'Generated task'}],temperature:0.2});assert.equal(chat.choices[0].message.content,'[]');
 operation='openai-error';await assert.rejects(openai.chat.completions.create({model:'fixture-error',messages:[{role:'user',content:'Generated failure'}]}),e=>e.status===401&&e.code==='invalid_api_key');
 const version=async name=>JSON.parse(await readFile(new URL('../node_modules/'+name+'/package.json',import.meta.url),'utf8')).version;
 const result={versions:{supabase:await version('@supabase/supabase-js'),openai:await version('openai')},requests,authEvents:{signedIn:events.includes('SIGNED_IN'),refreshed:events.includes('TOKEN_REFRESHED'),signedOut:events.includes('SIGNED_OUT')},storageHydration:true,legacySessionMigration:true,realtimeChannelConfigurationAndCleanup:true};
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2));console.log(`SDK contract passed: ${requests.length} loopback requests; Supabase ${result.versions.supabase}, OpenAI ${result.versions.openai}.`);
}finally{for(const client of clients){await client.removeAllChannels();await client.auth.stopAutoRefresh();}globalThis.window=previousWindow;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
