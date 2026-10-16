import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { SourceDefinition } from '@ntk/hunter-core';

/** A crashed instance delays work for ten minutes; it never authorizes a duplicate poll. */
export class PersistentRunGuard {
  private token=randomUUID();
  constructor(private db:Firestore) {}
  async acquire(now:Date):Promise<boolean> {
    const ref=this.db.doc('internal/schedulerLease');
    return this.db.runTransaction(async tx=>{
      const old=await tx.get(ref);
      if(Number(old.data()?.expiresMs??0)>now.getTime())return false;
      tx.set(ref,{token:this.token,expiresMs:now.getTime()+10*60000});return true;
    });
  }
  async release():Promise<void> {
    const ref=this.db.doc('internal/schedulerLease');
    await this.db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.data()?.token===this.token)tx.delete(ref);});
  }
  async reserve(sources:readonly SourceDefinition[],now:Date):Promise<string[]> {
    if(!sources.length)return [];
    return this.db.runTransaction(async tx=>{
      const refs=sources.map(s=>this.db.doc(`internal/sourceSchedule/sources/${s.id}`));
      const docs=await tx.getAll(...refs);const ids:string[]=[];
      sources.forEach((s,i)=>{
        const at=Date.parse(String(docs[i]?.data()?.lastAttemptAt??''));
        if(Number.isFinite(at) && now.getTime()-at<s.minIntervalMinutes*60000)return;
        tx.set(refs[i]!,{sourceId:s.id,lastAttemptAt:now.toISOString()});ids.push(s.id);
      });return ids;
    });
  }
}
