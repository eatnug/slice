import fs from 'fs';
import path from 'path';

const DEFAULT_CONFIG = {
  version: 1,
  timezone: 'Asia/Seoul',
  paths: {
    slices: 'slices',
    stories: 'stories',
    entitiesRegistry: 'entities/registry.yaml',
    plugins: '.slice/plugins',
    runtime: '.slice/runtime'
  },
  startup: { recentSlicesLimit: 8 }
};

export function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;

  if (!command || command === '--help' || command === '-h') return printHelp();
  if (command === 'init') return initRepo(rest);
  if (command === 'briefing') return briefing(rest);
  if (command === 'retrieve') return retrieve(rest);
  if (command === 'slice') return sliceCommand(rest);
  if (command === 'lifecycle') return lifecycle(rest);
  if (command === 'validate') return validate(rest);
  if (command === 'config') return printConfig();

  if (command === 'search') return retrieve(['search', ...rest]);
  if (command === 'capture') return sliceCommand(['capture', ...rest]);
  if (command === 'lint') return validate(rest);

  fail(`Unknown command: ${command}`);
}

function printHelp() {
  console.log(`Usage:
  slice init [repo]
  slice briefing [--json] [--recent N]
  slice retrieve search <query>
  slice retrieve recent [N]
  slice slice capture <subject> <at> <content> [--open <true|false>]
  slice lifecycle run <event>
  slice validate [--strict]

Compatibility aliases:
  slice search <query>
  slice capture <subject> <at> <content>
  slice lint`);
}

function initRepo(args) {
  const target = path.resolve(args[0] || process.cwd());
  ensureDir(path.join(target, 'slices'));
  ensureDir(path.join(target, 'stories'));
  ensureDir(path.join(target, 'entities'));
  ensureDir(path.join(target, '.slice'));
  ensureDir(path.join(target, '.slice', 'plugins'));
  writeIfMissing(path.join(target, 'entities', 'registry.yaml'), 'entities: []\n');
  writeIfMissing(path.join(target, '.slice', 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  writeIfMissing(path.join(target, '.slice', 'plugins', 'todo.md'), `---
id: todo
label: Todo
triggers:
  - session_start
  - after_capture
  - after_turn
---

# Todo

## When
Use this plugin when the lifecycle event may affect active attention, open loops, waiting items, deferred items, blocked items, or done items.

## Do
Read the event payload and relevant memory files. If needed, inspect stories/todo.md and relevant slices.

## Output
Return one of:

- skipped
- completed
- proposed
- blocked
`);
  writeIfMissing(path.join(target, '.slice', 'plugins', 'identity.md'), `---
id: identity
label: Identity
triggers:
  - session_start
  - after_turn
---

# Identity

## When
Use this plugin when stable self-model context is needed, or when the user explicitly confirms a durable identity-level change.

## Do
At session_start, read stories/identity.md if it exists.

At after_turn, only consider updates when the user has explicitly confirmed a stable self-model change.

## Output
Return one of:

- skipped
- completed
- proposed
- blocked
`);
  console.log(`Initialized slice repo: ${target}`);
}

function briefing(args) {
  const repo = findRepo();
  const config = readConfig(repo);
  const recentLimit = numberArg(args, '--recent', config.startup?.recentSlicesLimit ?? 8);
  const json = args.includes('--json');
  const slices = readMarkdownTree(path.join(repo, config.paths.slices), 'slices');
  const stories = readMarkdownTree(path.join(repo, config.paths.stories), 'stories');
  const entities = readRegistry(path.join(repo, config.paths.entitiesRegistry));
  const recentSlices = [...slices]
    .sort((a, b) => String(b.frontmatter.at || '').localeCompare(String(a.frontmatter.at || '')))
    .slice(0, recentLimit);
  const payload = {
    repo,
    counts: { slices: slices.length, stories: stories.length, entities: entities.length },
    recentSlices: recentSlices.map(note => ({ title: note.title, at: note.frontmatter.at, path: path.relative(repo, note.filePath) }))
  };

  if (json) return console.log(JSON.stringify(payload, null, 2));
  console.log('Slice briefing');
  console.log(`Memory: ${payload.counts.slices} slices, ${payload.counts.stories} stories, ${payload.counts.entities} entities`);
  console.log('Recent slices');
  for (const item of payload.recentSlices) console.log(`- ${item.title} (${item.at || 'unknown'}) - ${item.path}`);
}

function retrieve(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === 'search') return search(rest);
  if (subcommand === 'recent') return recent(rest);
  fail('Usage: slice retrieve search <query> | slice retrieve recent [N]');
}

function search(args) {
  const repo = findRepo();
  const config = readConfig(repo);
  const query = args.filter(arg => !arg.startsWith('--')).join(' ').trim();
  if (!query) fail('Usage: slice retrieve search <query>');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const notes = [
    ...readMarkdownTree(path.join(repo, config.paths.slices), 'slices'),
    ...readMarkdownTree(path.join(repo, config.paths.stories), 'stories')
  ];
  const results = notes
    .map(note => ({ note, score: scoreText(`${note.title}\n${note.body}`, terms) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, numberArg(args, '--limit', 10));

  console.log(`Search: ${query}`);
  for (const result of results) {
    console.log(`- [${result.score}] ${result.note.title} - ${path.relative(repo, result.note.filePath)}`);
    const snippet = makeSnippet(result.note.body, terms);
    if (snippet) console.log(`  ${snippet}`);
  }
}

function recent(args) {
  const repo = findRepo();
  const config = readConfig(repo);
  const limit = Number(args[0] || config.startup?.recentSlicesLimit || 8);
  const notes = readMarkdownTree(path.join(repo, config.paths.slices), 'slices')
    .sort((a, b) => String(b.frontmatter.at || '').localeCompare(String(a.frontmatter.at || '')))
    .slice(0, limit);
  console.log(`Recent slices (${notes.length})`);
  for (const note of notes) console.log(`- ${note.title} (${note.frontmatter.at || 'unknown'}) - ${path.relative(repo, note.filePath)}`);
}

function sliceCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === 'capture' || subcommand === 'create') return captureSlice(rest);
  fail('Usage: slice slice capture <subject> <at> <content> [--open <true|false>]');
}

function lifecycle(args) {
  const [subcommand, eventName] = args;
  if (subcommand !== 'run' || !eventName) fail('Usage: slice lifecycle run <event>');

  const repo = findRepo();
  const config = readConfig(repo);
  const pluginsRoot = path.join(repo, config.paths.plugins);
  const plugins = readPluginFiles(pluginsRoot).filter(plugin => plugin.frontmatter.triggers.includes(eventName));

  console.log(`Lifecycle event: ${eventName}`);
  if (!plugins.length) {
    console.log('Triggered plugins: none');
    return;
  }

  console.log('Triggered plugins:');
  for (const plugin of plugins) {
    console.log(`- ${plugin.frontmatter.id || path.basename(plugin.filePath, '.md')} (${path.relative(repo, plugin.filePath)})`);
  }
  console.log('');
  console.log("Apply each plugin's When/Do/Output sections if relevant.");
  for (const plugin of plugins) {
    console.log('');
    console.log(`--- ${path.relative(repo, plugin.filePath)} ---`);
    console.log(plugin.raw.trim());
  }
}

function captureSlice(args) {
  if (args.length < 3) fail('Usage: slice slice capture <subject> <at> <content> [--open <true|false>]');
  const repo = findRepo();
  const config = readConfig(repo);
  const subject = args[0];
  const at = args[1];
  const content = args[2];
  const isOpen = args.includes('--open') ? args[args.indexOf('--open') + 1] === 'true' : true;
  const date = at.split(' ')[0];
  const [year, month] = date.split('-');
  const kebabSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const dirPath = path.join(repo, config.paths.slices, year, month);
  const filePath = path.join(dirPath, `slice-${date}-${kebabSubject}.md`);
  const fileContent = `---\nat: ${at}\nopen: ${isOpen}\nsubject: ${subject}\n---\n\n# ${subject}\n\n${content}\n`;
  ensureDir(dirPath);
  fs.writeFileSync(filePath, fileContent);
  console.log(`Successfully captured slice: ${path.relative(repo, filePath)}`);
}

function validate(args) {
  const repo = findRepo();
  const config = readConfig(repo);
  const strict = args.includes('--strict');
  const issues = [];
  for (const note of readMarkdownTree(path.join(repo, config.paths.slices), 'slices')) {
    const filename = path.basename(note.filePath);
    if (!/^slice-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(filename)) {
      issues.push({ level: 'warn', path: path.relative(repo, note.filePath), message: 'slice filename should be slice-YYYY-MM-DD-kebab-case.md' });
    }
    if (!note.frontmatter.at) issues.push({ level: 'error', path: path.relative(repo, note.filePath), message: 'missing required frontmatter: at' });
  }
  const errors = issues.filter(issue => issue.level === 'error');
  const warnings = issues.filter(issue => issue.level === 'warn');
  if (!issues.length) return console.log('Slice validate passed.');
  console.log(`Slice validate found ${errors.length} error(s), ${warnings.length} warning(s).`);
  for (const issue of issues) console.log(`${issue.level.toUpperCase()} ${issue.path}: ${issue.message}`);
  if (errors.length || (strict && warnings.length)) process.exitCode = 1;
}

function printConfig() {
  const repo = findRepo();
  console.log(JSON.stringify({ path: path.relative(repo, configPath(repo)), config: readConfig(repo) }, null, 2));
}

function findRepo(start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(configPath(current))) return current;
    const parent = path.dirname(current);
    if (parent === current) fail('Could not find .slice/config.json. Run slice init first.');
    current = parent;
  }
}

function configPath(repo) {
  return path.join(repo, '.slice', 'config.json');
}

function readConfig(repo) {
  const filePath = configPath(repo);
  if (!fs.existsSync(filePath)) fail(`Missing config: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function readMarkdownTree(root, space) {
  if (!fs.existsSync(root)) return [];
  return walk(root).filter(file => file.endsWith('.md')).map(filePath => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseMarkdown(raw);
    return { filePath, space, frontmatter, body, title: firstHeading(body) || path.basename(filePath, '.md') };
  });
}

function readPluginFiles(root) {
  if (!fs.existsSync(root)) return [];
  return walk(root).filter(file => file.endsWith('.md')).map(filePath => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseMarkdown(raw);
    return {
      filePath,
      raw,
      body,
      frontmatter: {
        ...frontmatter,
        triggers: parseList(frontmatter.triggers)
      }
    };
  });
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function parseMarkdown(raw) {
  if (!raw.startsWith('---\n')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: {}, body: raw };
  const frontmatter = {};
  let currentListKey = null;
  for (const line of raw.slice(4, end).trim().split('\n')) {
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentListKey) {
      frontmatter[currentListKey].push(listMatch[1].trim());
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value === '') {
      frontmatter[key] = [];
      currentListKey = key;
      continue;
    }

    frontmatter[key] = value;
    currentListKey = null;
  }
  return { frontmatter, body: raw.slice(end + 5) };
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function firstHeading(body) {
  const line = body.split('\n').find(item => item.startsWith('# '));
  return line ? line.slice(2).trim() : '';
}

function readRegistry(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => /^\s*-\s+id:/.test(line));
}

function scoreText(text, terms) {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function makeSnippet(text, terms) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).find(line => terms.some(term => line.toLowerCase().includes(term))) || '';
}

function numberArg(args, flag, fallback) {
  const idx = args.indexOf(flag);
  return idx === -1 ? fallback : Number(args[idx + 1] || fallback);
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
