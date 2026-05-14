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

test('thought-map emits graph data from slices stories and entities', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-thought-map-test-'));
  runSlice(['init', repo]);

  const content = [
    '- [[user]] connected [[life-os]] to [[job-search]].',
    '- [[life-os]] keeps [[job-search]] context visible.'
  ].join('\n');

  runSlice(['slice', 'capture', 'Life OS direction', '2026-05-13', content], repo);
  fs.writeFileSync(
    path.join(repo, 'stories', 'job-search.md'),
    '# Job Search\n\n- [[job-search]] is active through [[life-os]].\n'
  );

  const payload = JSON.parse(runSlice(['thought-map', '--json'], repo));
  assert.equal(payload.meta.title, 'Memory Graph');
  assert.ok(payload.graph.nodes.some(node => node.type === 'slice' && node.title === 'Life OS direction'));
  assert.ok(payload.graph.nodes.some(node => node.type === 'story' && node.title === 'Job Search'));
  assert.ok(payload.graph.nodes.some(node => node.type === 'entity' && node.entityId === 'life-os'));
  assert.ok(payload.graph.links.some(link => link.source.includes('slice:') && link.target === 'entity:life-os'));
});
