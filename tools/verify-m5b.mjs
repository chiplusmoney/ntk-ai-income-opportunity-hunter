import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), 'ntk-hunter-checks-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run verify:m5b');
const results = [];
if (!process.version.startsWith('v24.')) throw new Error('Run the verification with the declared Node 24 runtime');
const env = { ...process.env, PATH: dirname(process.execPath) + ';' + process.env.PATH };
delete env.npm_config_allow_scripts;
delete env.NPM_CONFIG_ALLOW_SCRIPTS;
function run(label, args) {
  const start=Date.now();
  const r=spawnSync(process.execPath,[npm,...args],{cwd:root,env,encoding:'utf8',maxBuffer:12*1024*1024,windowsHide:true});
  process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');
  const row={label,command:'npm '+args.join(' '),exitCode:r.status,durationMs:Date.now()-start};results.push(row);
  const plain=(r.stdout??'').replace(/\u001b\[[0-9;]*m/g,'');
  if (label === 'permitted-source-verification' || label === 'emulator-and-security-rules') {
    const totals=[...plain.matchAll(/Tests\s+(\d+)\s+passed/g)];
    if (totals.length === 1) row.verifiedTests=Number(totals[0][1]);
  }
  if(r.status!==0) throw new Error(label+' failed');
  return row;
}
try {
  run('clean-install',['ci']);
  run('typecheck',['run','typecheck']);
  for(const [label,workspace] of [['core','packages/core'],['web','apps/web'],['api','services/hunter-api'],['scheduler','workers/hunter-scheduler']]){
    const file=join(temp,label+'.json');
    const row=run('unit-'+label,['--workspace',workspace,'run','test','--','--reporter=json','--outputFile='+file]);
    const j=JSON.parse(readFileSync(file,'utf8'));Object.assign(row,{passed:j.numPassedTests,failed:j.numFailedTests,skipped:j.numPendingTests,total:j.numTotalTests});
  }
  run('build',['run','build']);
  run('permitted-source-verification',['run','verify:live']);
  run('emulator-and-security-rules',['run','verify:emulator']);
  run('dependency-audit',['audit','--audit-level=high']);
} catch(error) { console.error(error.message); process.exitCode=1; }
finally {
  const report={generatedAt:new Date().toISOString(),node:process.version,status:process.exitCode?'FAIL':'PASS',results,unitPassed:results.reduce((n,r)=>n+(r.passed??0),0),unitFailed:results.reduce((n,r)=>n+(r.failed??0),0),sourceVerificationPassed:results.find(r=>r.label==='permitted-source-verification')?.verifiedTests??null,emulatorPassed:results.find(r=>r.label==='emulator-and-security-rules')?.verifiedTests??null,productionAcceptance:'Recorded separately; these automated checks do not prove live acceptance.'};
  mkdirSync(join(root,'docs/verification'),{recursive:true});writeFileSync(join(root,'docs/verification/automated.json'),JSON.stringify(report,null,2)+'\n');
  // Only remove the exact mkdtemp child of the system temporary directory.
  if (!resolve(temp).startsWith(resolve(tmpdir()) + sep) || !basename(temp).startsWith('ntk-hunter-checks-')) throw new Error('Unsafe temporary cleanup path');
  rmSync(temp,{recursive:true,force:true});
}
