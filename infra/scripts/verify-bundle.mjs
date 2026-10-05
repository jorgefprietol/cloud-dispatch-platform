import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';

const fixedVersion = '5.0.12';
const officialIntegrity = 'sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==';

function files(directory, prefix = '') {
  return readdirSync(directory).sort().flatMap(name => {
    const file = join(directory, name);
    const path = prefix + name;
    const stat = lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), 'Unexpected package symlink: ' + path);
    if (stat.isDirectory()) return files(file, path + '/');
    assert.ok(stat.isFile(), 'Unexpected package entry: ' + path);
    return [path];
  });
}

export function verifyBundle({
  source = resolve('node_modules/brace-expansion'),
  target = resolve('node_modules/aws-cdk-lib/node_modules/brace-expansion'),
  lockfile = resolve('package-lock.json'),
} = {}) {
  const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
  const pinned = lock.packages['node_modules/brace-expansion'];
  assert.equal(pinned.version, fixedVersion, 'Unexpected security patch version');
  assert.equal(pinned.resolved, 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz', 'Unexpected patch source');
  assert.equal(pinned.integrity, officialIntegrity, 'Unexpected official package integrity');
  for (const directory of [source, target]) {
    assert.equal(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version, fixedVersion, 'Security repair missing');
  }
  const expected = files(source);
  assert.deepEqual(files(target), expected, 'Patched package file inventory mismatch');
  const verifiedFiles = expected.map(file => {
    const sha256 = directory => createHash('sha256').update(readFileSync(join(directory, file))).digest('hex');
    const digest = sha256(source);
    assert.equal(sha256(target), digest, 'Patched file mismatch: ' + file);
    return {file, sha256: digest};
  });
  return {
    package: 'brace-expansion',
    installedVersion: fixedVersion,
    sourceIntegrity: pinned.integrity,
    cdkVersion: lock.packages['node_modules/aws-cdk-lib'].version,
    bundledLockMetadataVersion: lock.packages['node_modules/aws-cdk-lib/node_modules/brace-expansion'].version,
    verifiedFiles,
  };
}
