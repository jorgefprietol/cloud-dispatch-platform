import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const source=resolve('node_modules/brace-expansion');
const target=resolve('node_modules/aws-cdk-lib/node_modules/brace-expansion');
const version=JSON.parse(readFileSync(`${target}/package.json`,'utf8')).version;
if(version!=='5.0.12')throw new Error('Security repair missing');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest=JSON.parse(readFileSync(`${source}/package.json`,'utf8'));
for(const file of ['package.json',manifest.main])if(hash(`${source}/${file}`)!==hash(`${target}/${file}`))throw new Error(`Patched file mismatch: ${file}`);
let stdout;
try{stdout=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['audit','--json'],{encoding:'utf8',shell:process.platform==='win32',maxBuffer:4*1024*1024});}
catch(error){if(!error.stdout)throw error;stdout=error.stdout;}
const report=JSON.parse(stdout);if(report.error)throw new Error(JSON.stringify(report.error));
const allowed=new Set(['GHSA-q2hr-2g5m-vwhr','GHSA-qhr7-859c-m2p7','GHSA-6j4f-fj2g-mc7p']);
for(const [name,entry] of Object.entries(report.vulnerabilities || {})){
  const bundledOnly=name==='brace-expansion'&&entry.nodes.every(node=>node==='node_modules/aws-cdk-lib/node_modules/brace-expansion')
    &&entry.via.every(issue=>typeof issue==='object'&&allowed.has(issue.url.split('/').at(-1)));
  if(!bundledOnly)throw new Error(`Unresolved audit finding: ${name} (${entry.severity})`);
}
console.log('Dependency audit passed; official brace-expansion 5.0.12 bundle repair verified.');
