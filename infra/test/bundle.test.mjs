import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {test} from 'node:test';
import {verifyBundle} from '../scripts/verify-bundle.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cdk-bundle-'));
  t.after(() => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('cdk-bundle-'));
    rmSync(root, {recursive: true});
  });
  const source = resolve('node_modules/brace-expansion');
  const target = join(root, 'patched');
  const lockfile = join(root, 'package-lock.json');
  cpSync(source, target, {recursive: true});
  cpSync('package-lock.json', lockfile);
  return {source, target, lockfile};
}

test('verified bundle covers both module formats and the official license', () => {
  const evidence = verifyBundle();
  for (const file of ['dist/commonjs/index.js', 'dist/esm/index.js', 'LICENSE'])
    assert.ok(evidence.verifiedFiles.some(item => item.file === file));
  assert.equal(evidence.installedVersion, '5.0.12');
});

test('CDK resolves the patched module with recursion and rewrite bounds', () => {
  const require = createRequire(resolve('node_modules/aws-cdk-lib/package.json'));
  const braces = require('brace-expansion');
  assert.equal(require.resolve('brace-expansion'), resolve('node_modules/aws-cdk-lib/node_modules/brace-expansion/dist/commonjs/index.js'));
  assert.deepEqual(braces.expand('dispatch-{api,worker}'), ['dispatch-api', 'dispatch-worker']);
  assert.equal(braces.EXPANSION_MAX_DEPTH, 1000);
  assert.equal(braces.EXPANSION_MAX_REWRITES, 1000);
});

test('missing security repair is rejected', t => {
  const paths = fixture(t);
  const file = join(paths.target, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = '5.0.9';
  writeFileSync(file, JSON.stringify(pkg));
  assert.throws(() => verifyBundle(paths), /Security repair missing/);
});

for (const file of ['dist/commonjs/index.js', 'dist/esm/index.js', 'LICENSE']) {
  test('tampering with ' + file + ' is rejected', t => {
    const paths = fixture(t);
    writeFileSync(join(paths.target, file), 'tampered');
    assert.throws(() => verifyBundle(paths), /Patched file mismatch/);
  });
}

test('stale executable files are rejected', t => {
  const paths = fixture(t);
  writeFileSync(join(paths.target, 'old-vulnerable.js'), 'obsolete');
  assert.throws(() => verifyBundle(paths), /file inventory mismatch/);
});

test('substituting the official package integrity is rejected', t => {
  const paths = fixture(t);
  const lock = JSON.parse(readFileSync(paths.lockfile, 'utf8'));
  lock.packages['node_modules/brace-expansion'].integrity = 'sha512-substituted';
  writeFileSync(paths.lockfile, JSON.stringify(lock));
  assert.throws(() => verifyBundle(paths), /official package integrity/);
});
