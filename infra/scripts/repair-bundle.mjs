import {verifyBundle} from './verify-bundle.mjs';
import {cpSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve('node_modules/brace-expansion');
const target=resolve('node_modules/aws-cdk-lib/node_modules/brace-expansion');
const version=JSON.parse(readFileSync(`${source}/package.json`,'utf8')).version;
if(version!=='5.0.12')throw new Error('Unexpected security patch version');
if(!existsSync(target))throw new Error('CDK bundle layout changed: review the security repair before upgrading');
// npm overrides do not replace bundled dependencies. Install the exact, official
// fixed package over the bundled implementation, including exports and license.
cpSync(source,target,{recursive:true,force:true});
if(JSON.parse(readFileSync(`${target}/package.json`,'utf8')).version!==version)throw new Error('Bundle repair failed');
verifyBundle();
console.log(`CDK bundled brace-expansion repaired to ${version}`);
