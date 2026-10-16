import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { ListingIndex,sameListing,personalFit,EMPTY_EARNING_PROFILE,personalizedNotices,DEFAULT_PERSONAL_NOTIFICATION_POLICY,sourceQuality } from '../packages/core/dist/index.js';
const now=new Date('2026-10-16T12:00:00Z');
const profile={...EMPTY_EARNING_PROFILE,country:'NG'};
const results=[];
for(const size of [1000,5000,10000]){
  const rows=Array.from({length:size},(_,i)=>({id:`synthetic:${i}`,sourceId:'synthetic',sourceItemId:String(i),title:`Synthetic role ${i}`,provider:`Synthetic employer ${i%100}`,sourceUrl:`https://example.invalid/jobs/${i}`,publishedAt:now.toISOString(),description:'Synthetic benchmark text only. This is not a discovered opportunity. Remote work and no upfront payment required.',category:'Development',requirements:[],skills:[],countries:['GLOBAL'],remote:true,directPay:true,noCvRequired:'unknown',capitalStatus:'confirmed_free',paymentMethods:[],deadline:null,rewardMin:null,rewardMax:null,currency:null,rewardBasis:'unknown',rankScore:i%100,confidence:50,riskLevel:'low',discoveredAt:now.toISOString(),reward:{min:null,max:null,currency:null,basis:'unknown',raw:null},evidence:{assertions:[{method:'absent'}]},dedupe:null,visibility:'published',risk:null}));
  const samples=[];
  for(let run=0;run<4;run++){
    const times={};let start=performance.now();const index=new ListingIndex();let matches=0;for(const row of rows){if(index.neighbors(row).some(e=>sameListing(row,e)))matches++;index.add(row);}times.dedupe=performance.now()-start;
    start=performance.now();[...rows].sort((a,b)=>b.rankScore-a.rankScore||a.id.localeCompare(b.id));times.ranking=performance.now()-start;
    start=performance.now();const fits=new Map(rows.map(r=>[r.id,personalFit(r,profile,[],[],{enabled:false,resetAt:null},now)]));times.personalFit=performance.now()-start;
    start=performance.now();sourceQuality({sourceId:'synthetic',itemsSeen:size,accepted:size,rejected:0},rows);times.healthAggregation=performance.now()-start;
    start=performance.now();const notices=personalizedNotices(rows,fits,[],{...DEFAULT_PERSONAL_NOTIFICATION_POLICY,enabled:true,rules:['confirmed-zero'],quietStart:0,quietEnd:0},now);times.notificationSelection=performance.now()-start;
    if(matches!==0||notices.length!==size)throw Error('Benchmark correctness failed');
    if(run)samples.push(times);
  }
  results.push({size,samplesMs:samples,worstWarmMs:Object.fromEntries(Object.keys(samples[0]).map(k=>[k,Math.max(...samples.map(s=>s[k]))]))});
}
const receipt={at:new Date().toISOString(),node:process.version,scope:'Synthetic local Node CPU measurements, not mobile browser certification or real opportunity/earnings data',clientCatalogCap:50,notificationServerCatalogCap:150,results};
writeFileSync(new URL('../docs/verification/m7-performance.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
