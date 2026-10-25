/* Local-only Plex/PlxNative bridge. Credentials never enter frontend responses. Node 16+. */
'use strict';
const http=require('http'),https=require('https'),fs=require('fs');
function request(base,path,headers={},body=null,binary=false) {
 return new Promise((resolve,reject)=>{
  const url=new URL(path,base);const b=body===null?null:Buffer.from(JSON.stringify(body));
  const req=(url.protocol==='https:'?https:http).request(url,{method:b?'POST':'GET',headers:{...headers,...(b?{'Content-Type':'application/json','Content-Length':b.length}:{})}},res=>{
   const chunks=[];let size=0;
   res.on('data',c=>{size+=c.length;if(size>8*1024*1024)res.destroy(new Error('Response too large'));else chunks.push(c);});
   res.on('error',reject);res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error('Upstream HTTP '+res.statusCode));
    const data=Buffer.concat(chunks);try{resolve(binary?{data,type:res.headers['content-type']}:JSON.parse(data.toString()));}catch(e){reject(new Error('Invalid upstream response'));}});
  });req.setTimeout(8000,()=>req.destroy(new Error('Request timed out')));req.on('error',reject);if(b)req.write(b);req.end();
 });
}
function launchPlxNative(params){
 return new Promise((resolve,reject)=>{
  require('child_process').execFile('/usr/bin/luna-send',['-n','1','luna://com.webos.applicationManager/launch',JSON.stringify({id:'com.beb.plxnative',params:{plex:params}})],{timeout:10000,maxBuffer:65536},(err,stdout)=>{
   if(err)return reject(new Error('PlxNative launch failed'));
   try{const result=JSON.parse(stdout);if(!result.returnValue)throw new Error('Launch rejected');resolve();}catch(e){reject(new Error('PlxNative launch failed'));}
  });
 });
}
function createBridge(config,call=request,launch=launchPlxNative){
 const ph={'Accept':'application/json','X-Plex-Token':config.plexToken,'X-Plex-Client-Identifier':config.plexClient};
 let cache=null,at=0,inflight=null,playing=false;let serverId=null;const artCache=new Map();
 const plex=path=>call(config.plexUrl,path,ph);
 async function serverIdentity(){if(!serverId){const data=await plex('/identity');serverId=data.MediaContainer&&data.MediaContainer.machineIdentifier;if(typeof serverId!=='string'||!serverId)throw new Error('Plex server identity unavailable');}return serverId;}
 async function list(force=false){
  if(!config.plexToken)return {configured:false,items:[]};
  if(!force&&cache&&Date.now()-at<30000)return cache;
  if(inflight)return inflight;
  inflight=(async()=>{
   const data=await plex('/hubs/continueWatching?count=12&includeGuids=1');
   const raw=data.MediaContainer.Metadata||(data.MediaContainer.Hub||[]).reduce((all,h)=>all.concat(h.Metadata||[]),[]);
   const items=await Promise.all(raw.filter(i=>['movie','episode'].includes(i.type)&&/^\d+$/.test(String(i.ratingKey))).slice(0,12).map(async i=>{
    const duration=Number(i.duration)||0,offset=Number(i.viewOffset)||0;
    return {id:String(i.ratingKey),title:i.type==='episode'?(i.grandparentTitle||i.title):i.title,subtitle:i.type==='episode'?'S'+i.parentIndex+' · E'+i.index+' — '+i.title:String(i.year||''),progress:duration?Math.max(0,Math.min(1,offset/duration)):0,remaining:Math.max(0,Math.ceil((duration-offset)/60000)),art:(i.type==='movie'?i.art:i.thumb)||i.thumb||i.parentThumb||'',playable:true};
   }));
   cache={configured:true,playbackConfigured:true,items};at=Date.now();return cache;
  })();try{return await inflight;}finally{inflight=null;}
 }
 let recentCache=null,recentAt=0,recentInflight=null;
 async function recent(){
  if(!config.plexToken)return {movies:[],shows:[]};
  if(recentCache&&Date.now()-recentAt<60000)return recentCache;
  if(recentInflight)return recentInflight;
  recentInflight=(async()=>{
   const sections=await plex('/library/sections');
   const groups=await Promise.all((sections.MediaContainer.Directory||[]).filter(s=>['movie','show'].includes(s.type)&&/^\d+$/.test(s.key)).map(async section=>{
    const data=await call(config.plexUrl,'/library/sections/'+section.key+'/all?type='+(section.type==='movie'?'1':'2')+'&sort=addedAt%3Adesc',{...ph,'X-Plex-Container-Start':'0','X-Plex-Container-Size':'12'});
    return (data.MediaContainer.Metadata||[]).filter(i=>['movie','show'].includes(i.type)&&/^\d+$/.test(String(i.ratingKey))).map(i=>({id:String(i.ratingKey),title:i.title,subtitle:String(i.year||''),type:i.type,added:Number(i.addedAt)||0,progress:0,remaining:0,art:i.art||i.thumb||'',action:'open',playable:true}));
   }));
   const all=groups.flat().sort((a,b)=>b.added-a.added);
   recentCache={movies:all.filter(i=>i.type==='movie').slice(0,12),shows:all.filter(i=>i.type==='show').slice(0,12)};recentAt=Date.now();return recentCache;
  })();try{return await recentInflight;}finally{recentInflight=null;}
 }
 const publicItems=items=>items.map(({art,...i})=>({...i,image:art?'/art/'+i.id:null}));
 async function findItem(id){const data=await list();let item=data.items.find(i=>i.id===id);if(!item){const r=await recent();item=r.movies.concat(r.shows).find(i=>i.id===id);}return item;}
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&origin!=='null'&&origin!==config.previewOrigin){res.writeHead(403);return res.end();}
  const cors={'Access-Control-Allow-Origin':origin||'null','Vary':'Origin','Cache-Control':'no-store'};
  const send=(code,data)=>{res.writeHead(code,{...cors,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'Access-Control-Allow-Headers':'Content-Type, X-CleanFrame','Access-Control-Allow-Methods':'GET, POST'});return res.end();}
  let u;try{u=new URL(req.url,'http://localhost');}catch(e){return send(400,{error:'Invalid URL'});}
  try {
   if(req.method==='GET'&&u.pathname==='/aerial'){const a=config.aerial||{};return send(200,{enabled:a.enabled===true,idleSeconds:a.idleSeconds||60,urls:(a.urls||[]).filter(u=>typeof u==='string'&&/^https:\/\//.test(u)).slice(0,12)});}
   if(req.method==='GET'&&u.pathname==='/recent'){const r=await recent();return send(200,{movies:publicItems(r.movies),shows:publicItems(r.shows)});}
   if(req.method==='GET'&&u.pathname==='/continue'){
    const data=await list();return send(200,{...data,items:data.items.map(({art,...i})=>({...i,image:art?'/art/'+i.id:null}))});
   }
   if(req.method==='GET'&&/^\/art\/\d+$/.test(u.pathname)){
    const item=await findItem(u.pathname.slice(5));
    if(!item||!/^\/library\/metadata\/\d+\/(?:thumb|art)(?:\/\d+)?$/.test(item.art))return send(404,{error:'Artwork unavailable'});
    const artKey=item.art;
    if(!artCache.has(artKey)){
     if(artCache.size>=12)artCache.delete(artCache.keys().next().value);
     const thumb='/photo/:/transcode?'+new URLSearchParams({url:item.art,width:'640',height:'360',minSize:'1',upscale:'0'}).toString();
     artCache.set(artKey,call(config.plexUrl,thumb,ph,null,true).catch(e=>{artCache.delete(artKey);throw e;}));
    }
    const art=await artCache.get(artKey);
    if(!/^image\/(jpeg|png|webp)(;|$)/.test(art.type||''))return send(502,{error:'Invalid artwork'});
    res.writeHead(200,{...cors,'Content-Type':art.type,'Cache-Control':'private, max-age=300'});return res.end(art.data);
   }
   if(req.method==='POST'&&/^\/play\/\d+$/.test(u.pathname)){
    if(req.headers['x-cleanframe']!=='1')return send(403,{error:'Invalid request'});
    if(playing)return send(409,{error:'Already opening PlxNative'});
    playing=true;
    try{
     const item=await findItem(u.pathname.slice(6));
     if(!item)return send(404,{error:'This title is no longer on your home screen'});
     await launch({server:await serverIdentity(),ratingKey:item.id,action:u.searchParams.get('action')==='open'?'open':item.action||'play'});
     return send(200,{ok:true});
    }finally{playing=false;}
   }
   send(404,{error:'Not found'});
  }catch(e){send(502,{error:'Media service unavailable. Please try again.'});}
 });
 return {server,list};
}
module.exports={createBridge,launchPlxNative,request};
if(require.main===module){const config=JSON.parse(fs.readFileSync(process.argv[2]));const {server}=createBridge(config);server.listen(config.port||8766,'127.0.0.1',()=>console.log('CleanFrame media bridge ready'));}
