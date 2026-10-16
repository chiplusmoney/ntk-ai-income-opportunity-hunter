import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { fingerprintOf, sameListing, sourceQuality, operationalSourceScore, toPublished, processCandidate,isServable,DEFAULT_ELIGIBILITY_PREFERENCES,DEFAULT_WEIGHTS,type OpportunityCandidate, type PublishedOpportunity, type ListingIdentity } from '@ntk/hunter-core';
import type { OpportunityWriter, WriteRunParams, WriteReport } from './writer.js';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const key=(r:PublishedOpportunity)=>hash(fingerprintOf(r.provider,r.title));
const identity=(r:PublishedOpportunity):ListingIdentity=>({ sourceId:r.sourceId,sourceItemId:r.sourceItemId,sourceUrl:r.sourceUrl,title:r.title,provider:r.provider,description:r.description.slice(0,1600),countries:r.countries,publishedAt:r.publishedAt });
const content=(r:PublishedOpportunity)=>hash([r.title,r.provider,r.description,r.sourceUrl,r.category,r.rewardMin,r.rewardMax,r.currency,r.rewardBasis,r.countries,r.deadline,r.remote,r.directPay,r.noCvRequired,r.capitalStatus,r.skills,r.requirements]);
type IndexEntry={ id:string;identity:ListingIdentity };
type Stored=PublishedOpportunity & { normalizedHash?:string;updatedAt?:string;provenance?:{sourceId:string;sourceUrl:string;evidenceHash:string}[] };

/** Bounded production dedupe across restarts. Stable IDs preserve user/application links.
 * No catalog scan: <=200 incoming records, <=200 index reads, <=400 direct record reads.
 * Index updates follow successful catalog writes. Missing/failed index writes fail the run;
 * they never cause deletion of an existing opportunity or its evidence. */
export class IntelligenceWriter implements OpportunityWriter {
  constructor(private db:Firestore,private delegate:OpportunityWriter) {}
  async writeRun(params:WriteRunParams):Promise<WriteReport> {
    const pending=await this.db.collection('internal/ingestionQueue/records').orderBy('__name__').limit(50).get();
    const allCandidates=new Map(params.candidatesById);
    const pool=new Map(params.published.map(r=>[r.id,r]));
    for(const d of pending.docs){const c=d.data().candidate as OpportunityCandidate;const source=params.sourcesById.get(c.sourceId);if(!source||!isServable(source,'public'))continue;const refreshed=processCandidate({candidate:c,source,existing:[],prefs:DEFAULT_ELIGIBILITY_PREFERENCES,weights:DEFAULT_WEIGHTS,userSkills:[],history:{},now:new Date(params.updatedAt)}).candidate;
      allCandidates.set(c.id,refreshed);if(refreshed.visibility==='published')pool.set(c.id,await toPublished(refreshed,source));}
    // The pipeline may first encounter the weaker mirror. Reconsider only a duplicate
    // that independently passed the other deterministic publication gates.
    for(const c of params.candidatesById.values()) if(c.dedupe?.verdict==='duplicate' && c.zeroCapital?.zeroCapital && c.eligibility?.eligible && !c.risk?.blocked && c.risk) {
      const s=params.sourcesById.get(c.sourceId);if(s)pool.set(c.id,await toPublished(c,s));
    }
    const queuedIds=new Set(pending.docs.map(d=>d.id));
    const ordered=[...pool.values()].sort((a,b)=>Number(queuedIds.has(b.id))-Number(queuedIds.has(a.id))||a.id.localeCompare(b.id));
    const incoming=ordered.slice(0,200),overflow=ordered.slice(200);
    const ids=[...new Set(incoming.map(key))];
    const indexes=ids.length ? await this.db.getAll(...ids.map(id=>this.db.doc(`internal/dedupe/keys/${id}`))) : [];
    const buckets=new Map(indexes.map(d=>[d.id,(d.data()?.entries??[]) as IndexEntry[]]));
    const matchedIds=incoming.map(row=>(buckets.get(key(row))??[]).find(e=>sameListing(identity(row),e.identity))?.id).filter((id):id is string=>!!id);
    const recordIds=[...new Set([...incoming.map(r=>r.id),...matchedIds])];
    const docs=recordIds.length ? await this.db.getAll(...recordIds.map(id=>this.db.collection('opportunities').doc(id))) : [];
    const existing=new Map(docs.filter(d=>d.exists).map(d=>[d.id,d.data() as Stored]));
    const selected=new Map<string,Stored>();const candidates=new Map(allCandidates);
    const byOrigin=new Map([...allCandidates.values()].map(c=>[`${c.sourceId}:${c.sourceItemId}`,c]));
    const metadataOnly=new Map<string,Stored>();
    const counters:Record<string,{new:number;known:number;duplicates:number;unchanged:number;committed:number}>={};
    const changedIndexes=new Map<string,IndexEntry[]>();
    for(const row of incoming) {
      const counter=counters[row.sourceId]??={new:0,known:0,duplicates:0,unchanged:0,committed:0};
      const bucket=buckets.get(key(row))??[];
      const match=bucket.find(e=>sameListing(identity(row),e.identity));
      const id=match?.id ?? row.id;
      const old=selected.get(id)??metadataOnly.get(id)??existing.get(id);
      if(match && match.id!==row.id && existing.has(id) && allCandidates.get(row.id)?.dedupe?.verdict!=='duplicate')counter.duplicates++;
      if(existing.has(id))counter.known++;else if(!selected.has(id))counter.new++;
      const refs=[...(old?.provenance??[]),...(old ? [{sourceId:old.sourceId,sourceUrl:old.sourceUrl,evidenceHash:old.evidenceHash}] : []),{sourceId:row.sourceId,sourceUrl:row.sourceUrl,evidenceHash:row.evidenceHash}];
      const provenance=[...new Map(refs.map(x=>[`${x.sourceId}:${x.sourceUrl}`,x])).values()].slice(-6);
      // Keep stronger captured evidence, even when a weaker feed was encountered first.
      // Same-source updates are authoritative for that posting, including removals.
      const useNew=!old || old.sourceId===row.sourceId || row.evidenceCount>old.evidenceCount;
      const keep=useNew ? row : old!;
      const merged:Stored={...keep,id,discoveredAt:old?.discoveredAt??row.discoveredAt,provenance,normalizedHash:content(keep)};
      const fresh=old?.updatedAt && Date.parse(params.updatedAt)-Date.parse(old.updatedAt)<86400000;
      const unchanged=old && old.normalizedHash===merged.normalizedHash && JSON.stringify(old.provenance)===JSON.stringify(provenance) && fresh;
      if(unchanged)counter.unchanged++;else {
        const c=byOrigin.get(`${keep.sourceId}:${keep.sourceItemId}`);
        if(c){selected.set(id,merged);metadataOnly.delete(id);candidates.set(id,{...c,id});}
        else if(old && JSON.stringify(old.provenance)!==JSON.stringify(provenance)) metadataOnly.set(id,merged);
      }
      if(!bucket.some(e=>e.id===id)) {
        // A collision bucket that is full keeps separate records rather than dropping one.
        if(bucket.length<8){bucket.push({id,identity:identity(keep)});buckets.set(key(row),bucket);changedIndexes.set(key(row),bucket);}
      }
    }
    for(const c of Object.values(counters))c.committed=0;
    for(const row of selected.values()){counters[row.sourceId]??={new:0,known:0,duplicates:0,unchanged:0,committed:0};counters[row.sourceId]!.committed++;}
    const report=await this.delegate.writeRun({...params,published:[...selected.values()],candidatesById:candidates});
    if(!report.ok) return report;
    // Deferred records resume before new ones; no repeat upstream request is needed.
    const queueMutations=[...overflow.filter(r=>allCandidates.has(r.id)).map(r=>({id:r.id,candidate:allCandidates.get(r.id)!})),...pending.docs.filter(d=>!overflow.some(r=>r.id===d.id)).map(d=>({id:d.id,candidate:null}))];
    for(let i=0;i<queueMutations.length;i+=400){const batch=this.db.batch();for(const m of queueMutations.slice(i,i+400)){const ref=this.db.collection('internal/ingestionQueue/records').doc(m.id);if(m.candidate)batch.set(ref,{candidate:m.candidate,queuedAt:params.updatedAt});else batch.delete(ref);}await batch.commit();}
    const day=params.updatedAt.slice(0,10);
    const receipt=this.db.doc(`internal/intelligence/runs/${hash(params.updatedAt)}`);
    const quality=params.sourceRuns.map(run=>({run,quality:sourceQuality(run,[...params.candidatesById.values()])}));
    await this.db.runTransaction(async tx=>{
      if((await tx.get(receipt)).exists)return;
      const dailyRef=this.db.doc(`internal/yield/days/${day}`);const daily=await tx.get(dailyRef);
      const healthRefs=quality.map(x=>this.db.doc(`internal/sourceHealth/sources/${x.run.sourceId}`));
      const previous=healthRefs.length ? await tx.getAll(...healthRefs) : [];
      const totals={fetched:0,accepted:0,rejected:0,duplicates:0,new:0,known:0,published:0,unchanged:0,writes:report.written};
      quality.forEach(({run,quality:q},i)=>{
        const c=counters[run.sourceId]??{new:0,known:0,duplicates:0,unchanged:0,committed:0};
        const old=previous[i]?.data();
        const entry={...q,new:c.new,known:c.known,duplicates:q.duplicates+c.duplicates,published:c.committed,unchanged:c.unchanged};
        const attempts=(old?.attempts??0)+1,successes=(old?.successes??0)+(run.ok?1:0);
        tx.set(healthRefs[i]!,{sourceId:run.sourceId,lastCrawl:run.startedAt,lastSuccess:run.ok?run.finishedAt:old?.lastSuccess??null,nextDueAt:null,ok:run.ok,httpStatus:run.httpStatus,error:run.error,bytes:run.bytes,...entry,attempts,successes,operationalScore:operationalSourceScore(q,successes/attempts*100),writes:c.committed*2,day,updatedAt:params.updatedAt});
        for(const k of ['fetched','accepted','rejected','duplicates','new','known','published','unchanged'] as const)totals[k]+=entry[k];
      });
      // Resumed records may belong to a source that was not polled this pass.
      for(const [id,c] of Object.entries(counters))if(!quality.some(x=>x.run.sourceId===id)){totals.new+=c.new;totals.known+=c.known;totals.duplicates+=c.duplicates;totals.published+=c.committed;totals.unchanged+=c.unchanged;}
      const newRows=[...selected.values()].filter(r=>!existing.has(r.id));
      totals.new=newRows.length;
      const old=daily.data()??{};const accumulated:Record<string,unknown>={day,updatedAt:params.updatedAt,runs:Number(old.runs??0)+1,deferred:Math.max(0,pool.size-incoming.length)};
      const dimensions:Record<string,Record<string,number>>={newBySource:{...(old.newBySource??{})},newByCategory:{...(old.newByCategory??{})},newByCountry:{...(old.newByCountry??{})},newByCapital:{...(old.newByCapital??{})},newByReward:{...(old.newByReward??{})}};
      const count=(dimension:string,key:string)=>{const map=dimensions[dimension]!;map[key]=(map[key]??0)+1;};
      for(const row of newRows){count('newBySource',row.sourceId);count('newByCategory',row.category);for(const c of row.countries.length?row.countries:['UNKNOWN'])count('newByCountry',c);count('newByCapital',row.capitalStatus);count('newByReward',row.currency&&(row.rewardMin!==null||row.rewardMax!==null)?'known':'unknown');}
      Object.assign(accumulated,dimensions);
      totals.writes+=queueMutations.length+metadataOnly.size+changedIndexes.size+quality.length+2;
      for(const [k,n] of Object.entries(totals))accumulated[k]=Number(old[k]??0)+n;
      tx.set(dailyRef,accumulated);
      for(const [id,row] of metadataOnly)tx.update(this.db.collection('opportunities').doc(id),{provenance:row.provenance!});
      for(const [id,entries] of changedIndexes)tx.set(this.db.doc(`internal/dedupe/keys/${id}`),{entries,updatedAt:params.updatedAt});
      tx.create(receipt,{at:params.updatedAt,day,sourceIds:quality.map(x=>x.run.sourceId),...totals,deferred:Math.max(0,pool.size-incoming.length)});
    });
    return report;
  }
}
