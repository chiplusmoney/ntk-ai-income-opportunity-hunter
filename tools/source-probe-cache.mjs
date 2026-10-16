import { mkdirSync,readFileSync,writeFileSync,renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Verification is not exempt from provider intervals. One cached response may
 * serve many assertions. Recent production receipts block a second network pass.
 * Source payload cache is local, ignored, bounded by the upstream HTTP contract;
 * no tokens or headers are persisted. */
export function createProbeCache({directory,sources,productionRuns=[],fetchImpl=fetch,now=()=>Date.now(),log=()=>{}}) {
  const memory=new Map();mkdirSync(directory,{recursive:true});
  return async (input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const source=sources.find(s=>new URL(s.endpoint).hostname===new URL(url).hostname);
    if(!source)throw Error('Source is not in the permitted verification plan');
    if(memory.has(url))return (await memory.get(url)).clone();
    const path=join(directory,createHash('sha256').update(url).digest('hex')+'.json');
    let previous=null;try{previous=JSON.parse(readFileSync(path,'utf8'));}catch{/* no usable local cache */}
    const interval=source.minIntervalMinutes*60000;
    if(previous&&Number.isFinite(previous.at)&&now()-previous.at<interval){
      if(typeof previous.body!=='string')throw Error(`${source.id}: previous verification attempt is pending or ambiguous; interval remains consumed`);
      log(`CACHE ${source.id}: captured ${new Date(previous.at).toISOString()}, no new provider request`);
      const response=new Response(previous.body,{status:previous.status,headers:{'content-type':previous.contentType??'application/json'}});memory.set(url,Promise.resolve(response));return response.clone();
    }
    const recent=productionRuns.find(r=>r.id===source.id)?.health?.lastCrawl;
    if(recent&&now()-Date.parse(recent)<interval)throw Error(`${source.id}: production poll is still inside the interval; use its dated production receipt instead of a second verification request`);
    const task=(async()=>{
      writeFileSync(path,JSON.stringify({at:now(),body:null,status:0,pending:true}));
      const response=await fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(45000)});
      const chunks=[];let size=0;
      if(response.body){const reader=response.body.getReader();try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw Error('Verification response exceeds byte limit');}chunks.push(value);}}finally{reader.releaseLock();}}
      const body=Buffer.concat(chunks).toString('utf8');
      const record={at:now(),body,status:response.status,contentType:response.headers.get('content-type')};
      // Even a failed request consumes its interval; no retry storm from failing assertions.
      const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(record));renameSync(tmp,path);
      log(`LIVE ${source.id}: one request at ${new Date(record.at).toISOString()}`);
      return new Response(body,{status:record.status,headers:{'content-type':record.contentType??'application/json'}});
    })();memory.set(url,task);return (await task).clone();
  };
}
