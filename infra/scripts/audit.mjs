import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {verifyBundle} from './verify-bundle.mjs';
const evidence=verifyBundle();
let stdout;
try{stdout=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['audit','--json'],{encoding:'utf8',shell:process.platform==='win32',maxBuffer:4*1024*1024});}
catch(error){if(!error.stdout)throw error;stdout=error.stdout;}
const report=JSON.parse(stdout);if(report.error)throw new Error(JSON.stringify(report.error));
const allowed=new Set(['GHSA-q2hr-2g5m-vwhr','GHSA-qhr7-859c-m2p7','GHSA-6j4f-fj2g-mc7p']);
for(const [name,entry] of Object.entries(report.vulnerabilities || {})){
  const bundledOnly=name==='brace-expansion'&&entry.nodes.length>0&&entry.via.length>0&&entry.nodes.every(node=>node==='node_modules/aws-cdk-lib/node_modules/brace-expansion')
    &&entry.via.every(issue=>typeof issue==='object'&&allowed.has(issue.url.split('/').at(-1)));
  if(!bundledOnly)throw new Error(`Unresolved audit finding: ${name} (${entry.severity})`);
}
mkdirSync('../artifacts/security',{recursive:true});
writeFileSync('../artifacts/security/cdk-bundle.json',JSON.stringify({...evidence,node:process.versions.node,metadataOnlyAdvisories:[...allowed].sort(),verifiedAt:new Date().toISOString()},null,2)+'\n');
console.log('Dependency audit passed; all '+evidence.verifiedFiles.length+' official brace-expansion 5.0.12 files verified.');
