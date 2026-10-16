import { createHash } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { earningProfileFromLegacy, noticeAllowed, personalFit, personalizedNotices, readNotificationPolicy, localNotificationTime, digestNotices, alertDetail, smartTelegramMessage, safeAlertLink,
  readProofRecord, type ApplicationRecord, type FitOpportunity, type LearningState, type ProofRecord } from '@ntk/hunter-core';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,32);
const terminal=new Set(['paid','rejected','expired','withdrawn']);
function validRow(o:Record<string,unknown>):boolean {
  return typeof o.title==='string'&&typeof o.description==='string'&&typeof o.category==='string'&&['skills','requirements','countries','paymentMethods'].every(k=>Array.isArray(o[k])&&(o[k] as unknown[]).every(x=>typeof x==='string'))
    && ['rewardMin','rewardMax'].every(k=>o[k]===null||typeof o[k]==='number'&&Number.isFinite(o[k]))&&['remote','directPay','noCvRequired'].every(k=>[true,false,'unknown'].includes(o[k] as boolean|string))
    && ['confirmed_free','unconfirmed_no_cost_found','capital_required'].includes(String(o.capitalStatus))&&typeof o.rewardBasis==='string'&&(o.currency===null||typeof o.currency==='string'&&/^[A-Z]{3}$/.test(o.currency))&&typeof o.discoveredAt==='string'&&Number.isFinite(Date.parse(o.discoveredAt));
}

/** Bounded resumable pass: <=2 opted-in users, 100 recent + <=50 saved rows/user,
 * <=50 applications, <=20 proofs, <=20 candidate-attempt reads/user, one delivery/user.
 * A transport timeout is consumed, never automatically retried. */
export async function dispatchPersonalNotices(db:Firestore,env:NodeJS.ProcessEnv,now=new Date(),fetchImpl:typeof fetch=fetch) {
  const cursorRef=db.doc('internal/notificationCursor');const cursor=(await cursorRef.get()).data();
  let q=db.collection('users').where('m6Notifications.enabled','==',true).orderBy(FieldPath.documentId()).limit(2);
  if(typeof cursor?.lastUser==='string')q=q.startAfter(cursor.lastUser);
  let users=await q.get();
  if(users.empty&&typeof cursor?.lastUser==='string')users=await db.collection('users').where('m6Notifications.enabled','==',true).orderBy(FieldPath.documentId()).limit(2).get();
  if(users.empty){await cursorRef.set({lastUser:null,at:now.toISOString()});return {users:0,written:0,skipped:0};}
  const catalog=await db.collection('opportunities').where('visibility','==','published').orderBy('discoveredAt','desc').limit(100).get();
  const recent=catalog.docs.map(d=>({...d.data(),id:d.id})).filter(validRow) as (FitOpportunity & {sourceUrl?:string;attribution?:string})[];
  let written=0,skipped=0;
  for(const user of users.docs){
    try{
      const raw=user.data();const policy=readNotificationPolicy(raw.m6Notifications);
      if(!policy?.enabled||(!policy.inApp&&!policy.telegram)){skipped++;continue;}
      const local=localNotificationTime(policy.timezone,now);
      const ledger=db.doc(`internal/personalNotifications/users/${user.id}`);const state=(await ledger.get()).data();
      if(!noticeAllowed({key:'pass',existingKeys:[],lastSentAt:state?.lastSentAt??null,sentToday:state?.day===local.day?state.count:0,policy,now})){skipped++;continue;}
      if(policy.mode==='digest'&&(local.hour<(policy.digestHour??9)||state?.lastDigestDay===local.day)){skipped++;continue;}
      const [apps,proofDocs]=await Promise.all([user.ref.collection('applications').limit(51).get(),user.ref.collection('proofs').limit(21).get()]);
      if(apps.size>50||proofDocs.size>20){skipped++;continue;}
      const applications=apps.docs.map(d=>({...d.data(),id:d.id})) as ApplicationRecord[];
      const proofs=proofDocs.docs.map(d=>readProofRecord(d.data(),d.id)).filter((p):p is ProofRecord=>p!==null);
      const extraIds=[...new Set(applications.filter(a=>!terminal.has(a.state)&&typeof a.opportunityId==='string').map(a=>a.opportunityId))].filter(id=>!recent.some(o=>o.id===id));
      const saved=extraIds.length?await db.getAll(...extraIds.map(id=>db.collection('opportunities').doc(id))):[];
      const rows=[...recent,...saved.filter(d=>d.exists&&d.data()?.visibility==='published').map(d=>({...d.data(),id:d.id})).filter(validRow) as typeof recent];
      const p=earningProfileFromLegacy(raw);const learning:LearningState={enabled:raw.recommendationLearning?.enabled===true,resetAt:raw.recommendationLearning?.resetAt??null};
      const fits=new Map(rows.map(o=>[o.id,personalFit(o,p,proofs,applications,learning,now)]));
      const cutoff=policy.mode==='digest'?state?.lastDigestAt??new Date(now.getTime()-86400000).toISOString():new Date(now.getTime()-86400000).toISOString();
      const knownKeys=new Set<string>(Array.isArray(state?.recentKeys)?state.recentKeys:[]);
      const notices=personalizedNotices(rows,fits,applications,policy,now).filter(n=>!knownKeys.has(n.key)&&(['deadline','follow-up','next-action','status-reminder','payment-follow-up'].includes(n.rule)||String(rows.find(o=>o.id===n.opportunityId)?.discoveredAt??'')>=cutoff))
        .sort((a,b)=>(fits.get(b.opportunityId)?.score??0)-(fits.get(a.opportunityId)?.score??0)||a.key.localeCompare(b.key)).slice(0,20);
      if(!notices.length)continue;
      const attempts=notices.map(n=>ledger.collection('attempts').doc(hash(n.key)));
      const ownerTelegram=policy.telegram&&user.id===env.NOTIFICATION_OWNER_UID&&!!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_OWNER_CHAT_ID;
      const delivery=await db.runTransaction(async tx=>{
        const [current,previous,currentUser]=await Promise.all([tx.get(ledger),tx.getAll(...attempts),tx.get(user.ref)]);const s=current.data();
        if(JSON.stringify(readNotificationPolicy(currentUser.data()?.m6Notifications))!==JSON.stringify(policy))return null;
        if(!noticeAllowed({key:'reserve',existingKeys:[],lastSentAt:s?.lastSentAt??null,sentToday:s?.day===local.day?s.count:0,policy,now}))return null;
        if(policy.mode==='digest'&&s?.lastDigestDay===local.day)return null;
        const fresh=notices.filter((_,i)=>!previous[i]?.exists);
        const selected=policy.mode==='digest'?digestNotices(fresh,policy.digestSize):fresh.slice(0,1);
        if(!selected.length)return null;
        const details=selected.map(n=>{
          const row=rows.find(o=>o.id===n.opportunityId);const d=alertDetail(n,row,fits.get(n.opportunityId));
          if(!row){const a=applications.find(a=>a.id===n.opportunityId);if(a){d.sourceUrl=safeAlertLink(a.sourceUrl);d.source=a.attribution;d.title=a.title;d.category=a.category;}}return d;
        });
        const text=smartTelegramMessage(details,policy.mode==='digest');
        const send=ownerTelegram&&details.some(d=>d.sourceUrl)&&text.includes('https://');
        if(!policy.inApp&&!send)return null;
        const id=`m7-${hash(selected.map(n=>n.key).join('|'))}`;
        tx.set(ledger,{day:local.day,count:s?.day===local.day?Number(s.count)+1:1,lastSentAt:now.toISOString(),recentKeys:[...new Set([...(s?.recentKeys??[]),...selected.map(n=>n.key)])].slice(-128),lastDigestDay:policy.mode==='digest'?local.day:s?.lastDigestDay??null,lastDigestAt:policy.mode==='digest'?now.toISOString():s?.lastDigestAt??null});
        for(const n of selected)tx.create(ledger.collection('attempts').doc(hash(n.key)),{rule:n.rule,reservedAt:now.toISOString(),telegramAttempted:send,notificationId:id});
        if(policy.inApp)tx.set(user.ref.collection('notifications').doc(id),{title:policy.mode==='digest'?'Your daily opportunity digest':selected[0]!.title,body:details.map(d=>d.reason).join('\n').slice(0,4000),opportunityId:selected[0]!.opportunityId,items:details,read:false,createdAt:now.toISOString(),channel:'in-app',status:'delivered',mode:policy.mode??'instant'});
        return {keys:selected.map(n=>n.key),send,text};
      });
      if(!delivery)continue;written++;
      if(delivery.send){
        let delivered=false;
        try{const r=await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_OWNER_CHAT_ID,text:delivery.text,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});const b=await r.json() as {ok?:boolean};delivered=r.ok&&b.ok===true;}catch{/* max sends = 1; no retry after ambiguity */}
        const batch=db.batch();for(const k of delivery.keys)batch.update(ledger.collection('attempts').doc(hash(k)),{telegramStatus:delivered?'delivered':'failed-or-unknown'});await batch.commit();
      }
    }catch{skipped++;/* one malformed account cannot starve the rest */}
  }
  await cursorRef.set({lastUser:users.docs.at(-1)!.id,at:now.toISOString(),users:users.size,written,skipped,catalogRows:recent.length});
  return {users:users.size,written,skipped};
}
