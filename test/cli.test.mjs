import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sliceBin = path.join(repoRoot, 'bin', 'slice.mjs');

function runSlice(args, cwd = repoRoot) {
  return execFileSync(process.execPath, [sliceBin, ...args], {
    cwd,
    encoding: 'utf8'
  });
}

test('capture writes canonical entity frontmatter and registry entries', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-cli-test-'));
  runSlice(['init', repo]);

  const content = [
    '- [[user]] proposed [[structured-slice-sentences]].',
    '- [[slice]] stores [[structured-narrative-records]].'
  ].join('\n');

  const output = runSlice(['slice', 'capture', 'Memory model design', '2026-05-07', content], repo);
  assert.match(output, /Successfully captured slice:/);
  assert.match(output, /Entities: .*user/);

  const slicePath = path.join(repo, 'slices', '2026', '05', 'slice-2026-05-07-memory-model-design.md');
  const slice = fs.readFileSync(slicePath, 'utf8');
  assert.match(slice, /entities:/);
  assert.match(slice, /  - "memory-model-design"/);
  assert.match(slice, /  - "user"/);
  assert.match(slice, /  - "structured-slice-sentences"/);

  const registry = fs.readFileSync(path.join(repo, 'entities', 'registry.yaml'), 'utf8');
  assert.match(registry, /id: "user"/);
  assert.match(registry, /label: "structured slice sentences"/);
  assert.match(registry, /slices\/2026\/05\/slice-2026-05-07-memory-model-design\.md/);

  const entity = runSlice(['entities', 'show', 'slice'], repo);
  assert.match(entity, /slice: slice/);
  assert.match(entity, /slice-2026-05-07-memory-model-design\.md/);

  assert.equal(runSlice(['validate'], repo).trim(), 'Slice validate passed.');
});
