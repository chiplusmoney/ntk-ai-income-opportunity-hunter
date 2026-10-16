import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { createProbeCache } from './source-probe-cache.mjs';
const source={id:'test',endpoint:'https://source.example/feed',minIntervalMinutes:60};
test('shares response across assertions and process-local cache instances',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'m7-probe-cache-'));let calls=0;const options={directory,sources:[source],now:()=>1000000,fetchImpl:async()=>{calls++;return new Response('{"real":"captured"}');}};
  try{const first=createProbeCache(options);assert.equal(await(await first(source.endpoint)).text(),'{"real":"captured"}');await first(source.endpoint);const restart=createProbeCache(options);await restart(source.endpoint);assert.equal(calls,1);}finally{if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cache cleanup');rmSync(directory,{recursive:true});}
});
test('a recent production receipt prevents another network synchronization',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'m7-probe-cache-'));let calls=0;
  try{const probe=createProbeCache({directory,sources:[source],now:()=>1000000,productionRuns:[{id:'test',health:{lastCrawl:new Date(900000).toISOString()}}],fetchImpl:async()=>{calls++;return new Response('unused');}});await assert.rejects(()=>probe(source.endpoint),/production poll/);assert.equal(calls,0);}finally{if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cache cleanup');rmSync(directory,{recursive:true});}
});
test('an unqualified host fails closed before network',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'m7-probe-cache-'));
  try{const probe=createProbeCache({directory,sources:[source],fetchImpl:async()=>{throw Error('must not fetch');}});await assert.rejects(()=>probe('https://other.example/feed'),/not in the permitted/);}finally{if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cache cleanup');rmSync(directory,{recursive:true});}
});
test('an ambiguous failed network request consumes its interval across restarts',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'m7-probe-cache-'));let calls=0;const options={directory,sources:[source],now:()=>1000000,fetchImpl:async()=>{calls++;throw Error('network timeout');}};
  try{await assert.rejects(()=>createProbeCache(options)(source.endpoint),/network timeout/);await assert.rejects(()=>createProbeCache(options)(source.endpoint),/ambiguous/);assert.equal(calls,1);}finally{if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cache cleanup');rmSync(directory,{recursive:true});}
});
