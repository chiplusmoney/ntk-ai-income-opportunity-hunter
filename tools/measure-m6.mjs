import { performance } from 'node:perf_hooks';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { EMPTY_EARNING_PROFILE, personalFit, selectRecommendations } from '../packages/core/dist/index.js';
const now=new Date('2026-10-16T12:00:00Z');
const profile={...EMPTY_EARNING_PROFILE,country:'NG',skills:['React'],categories:['Development']};
const rows=Array.from({length:5000},(_,i)=>({id:'benchmark:'+i,title:'Synthetic benchmark only',category:'Development',description:'No CV required.',requirements:[],skills:i%2?['React']:['Go'],countries:['GLOBAL'],remote:true,directPay:true,noCvRequired:true,capitalStatus:'unconfirmed_no_cost_found',paymentMethods:[],deadline:null,rewardMin:null,rewardMax:null,currency:null,rewardBasis:'unknown',rankScore:70,confidence:60,riskLevel:'low',discoveredAt:now.toISOString()}));
const samples=[];for(let run=0;run<6;run++){const start=performance.now();const fits=new Map(rows.map(o=>[o.id,personalFit(o,profile,[],[],{enabled:false,resetAt:null},now)]));selectRecommendations(rows,fits,'Highest fit',[],now);samples.push(performance.now()-start);}
const assets=readdirSync('apps/web/dist/assets').map(name=>{const b=readFileSync('apps/web/dist/assets/'+name);return{name,bytes:b.length,gzipBytes:gzipSync(b).length};});
const result={generatedAt:new Date().toISOString(),node:process.version,environment:'Local Node CPU benchmark; synthetic records only, no cloud I/O or mobile performance certification',records:rows.length,warmSamplesMs:samples.slice(1),maxWarmMs:Math.max(...samples.slice(1)),assets,baselineMainBundle:{bytes:891000,gzipBytes:271000,source:'Rounded M5b accepted build receipt'},memoization:'React useMemo by catalog/profile/proof/application/learning/minute; no re-ranking for unrelated form typing'};
writeFileSync('docs/verification/m6-performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({records:result.records,maxWarmMs:result.maxWarmMs,assets},null,2));
