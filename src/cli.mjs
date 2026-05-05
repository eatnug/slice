import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const PACKAGE_VERSION = '0.1.9';
const CONTRACT_VERSION = 'slice-memory@0.1';
const RUNTIME_RANGE = '>=0.1.9 <0.2.0';
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONNECTORS_ROOT = path.join(PACKAGE_ROOT, 'templates', 'connectors');

const DEFAULT_CONFIG = {
  version: 1,
  timezone: 'Asia/Seoul',
  runtime: {
    package: 'slice-memory-cli',
    version: RUNTIME_RANGE,
    contract: CONTRACT_VERSION
  },
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
  if (command === 'context') return printAgentContext(rest);
  if (command === 'connectors') return connectors(rest);
  if (command === 'validate') return validate(rest);
  if (command === 'config') return printConfig();
  if (command === 'version' || command === '--version' || command === '-v') return printVersion();

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
  slice context [agent]
  slice connectors list
  slice connectors show <connector> [--json]
  slice connectors install <connector> [--force] [--json]
  slice connectors sync [--json]
  slice validate [--strict]
  slice version

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
  ensureDir(path.join(target, '.codex', 'skills', 'slice'));
  ensureDir(path.join(target, '.claude', 'skills', 'slice'));
  ensureDir(path.join(target, '.gemini', 'extensions', 'slice'));
  ensureDir(path.join(target, '.slice', 'plugins', 'todo'));
  ensureDir(path.join(target, '.slice', 'plugins', 'identity'));
  writeIfMissing(path.join(target, 'entities', 'registry.yaml'), 'entities: []\n');
  writeIfMissing(path.join(target, '.slice', 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  writeIfMissing(path.join(target, 'AGENTS.md'), bootloaderTemplate('Agent'));
  writeIfMissing(path.join(target, 'CLAUDE.md'), bootloaderTemplate('Claude'));
  writeIfMissing(path.join(target, 'CODEX.md'), bootloaderTemplate('Codex'));
  writeIfMissing(path.join(target, 'GEMINI.md'), bootloaderTemplate('Gemini'));
  writeIfMissing(path.join(target, '.codex', 'skills', 'slice', 'SKILL.md'), sliceSkillTemplate('codex'));
  writeIfMissing(path.join(target, '.claude', 'skills', 'slice', 'SKILL.md'), sliceSkillTemplate('claude'));
  writeIfMissing(path.join(target, '.gemini', 'extensions', 'slice', 'gemini-extension.json'), geminiExtensionTemplate());
  writeIfMissing(path.join(target, '.gitignore'), gitignoreTemplate());
  writeIfMissing(path.join(target, '.slice', 'plugins', 'todo', 'PLUGIN.md'), `---
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
  writeIfMissing(path.join(target, '.slice', 'plugins', 'identity', 'PLUGIN.md'), `---
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
    .sort((a, b) => compareAtDesc(a.frontmatter.at, b.frontmatter.at))
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
    .sort((a, b) => compareAtDesc(a.frontmatter.at, b.frontmatter.at))
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

function printAgentContext(args) {
  const agentName = normalizeAgentName(args[0]);
  let compatibility = runtimeCompatibility();
  try {
    const repo = findRepo();
    const config = readConfig(repo);
    syncMcpConnectors(repo, config);
  } catch (error) {
    console.error(`WARN Slice MCP connector sync skipped: ${error.message}`);
  }
  if (compatibility.level === 'error') fail(compatibility.message);
  if (compatibility.level === 'warn') console.error(`WARN ${compatibility.message}`);
  console.log(agentContextTemplate(agentName, compatibility).trim());
}

function connectors(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === 'list' || !subcommand) return listConnectors(rest);
  if (subcommand === 'show') return showConnector(rest);
  if (subcommand === 'install') return installConnector(rest);
  if (subcommand !== 'sync') fail('Usage: slice connectors list | slice connectors show <connector> [--json] | slice connectors install <connector> [--force] [--json] | slice connectors sync [--json]');
  const repo = findRepo();
  const config = readConfig(repo);
  const result = syncMcpConnectors(repo, config);
  if (rest.includes('--json')) return console.log(JSON.stringify(result, null, 2));
  if (!result.servers.length) return console.log('No MCP connector examples found.');
  console.log('Slice MCP connectors synced.');
  console.log(`Repo: ${repo}`);
  for (const server of result.servers) console.log(`- ${server.name}: ${server.plugin}`);
  for (const filePath of result.written) console.log(`Wrote: ${filePath}`);
  if (result.skipped.length) {
    console.log('Skipped:');
    for (const item of result.skipped) console.log(`- ${item.path}: ${item.reason}`);
  }
}

function listConnectors(args) {
  const json = args.includes('--json');
  const connectors = readConnectorRegistry();
  const payload = connectors.map(connector => ({
    id: connector.id,
    aliases: connector.aliases,
    label: connector.label,
    description: connector.description
  }));
  if (json) return console.log(JSON.stringify(payload, null, 2));
  console.log('Slice connectors');
  for (const connector of connectors) {
    console.log(`- ${connector.id}: ${connector.label} — ${connector.description}`);
  }
}

function showConnector(args) {
  const id = args.find(arg => !arg.startsWith('--'));
  if (!id) fail('Usage: slice connectors show <connector> [--json]');
  const connector = resolveConnector(id);
  if (!connector) fail(`Unknown connector: ${id}. Run slice connectors list.`);
  const prompts = readConnectorPrompts(connector);
  const payload = {
    id: connector.id,
    aliases: connector.aliases,
    label: connector.label,
    description: connector.description,
    pluginPath: connector.pluginPath,
    prompts
  };
  if (args.includes('--json')) return console.log(JSON.stringify(payload, null, 2));
  console.log(`${connector.id}: ${connector.label}`);
  console.log(connector.description);
  console.log('');
  for (const [name, content] of Object.entries(prompts)) {
    console.log(`--- ${name} prompt ---`);
    console.log(content.trim());
    console.log('');
  }
}

function installConnector(args) {
  const id = args.find(arg => !arg.startsWith('--'));
  if (!id) fail('Usage: slice connectors install <connector> [--force] [--json]');
  const connector = resolveConnector(id);
  if (!connector) fail(`Unknown connector: ${id}. Run slice connectors list.`);

  const repo = findRepo();
  const config = readConfig(repo);
  const force = args.includes('--force');
  const json = args.includes('--json');
  const source = path.join(connector.dir, connector.files || 'files');
  if (!fs.existsSync(source)) fail(`Missing connector files directory: ${path.relative(PACKAGE_ROOT, source)}`);

  const copied = copyTemplate(source, repo, { force });
  const sync = syncMcpConnectors(repo, config);
  const pluginDir = path.join(repo, connector.pluginPath);
  const result = {
    connector: connector.id,
    label: connector.label,
    repo,
    plugin: connector.pluginPath,
    prompts: connector.prompts || {},
    copied,
    sync,
    next: [
      `cd ${path.relative(repo, path.join(pluginDir, 'tools', 'google_workspace_mcp')) || '.'}`,
      connector.authCommand,
      'Restart your MCP client so it reloads config.'
    ]
  };
  if (json) return console.log(JSON.stringify(result, null, 2));
  console.log(`Installed Slice connector: ${connector.id}`);
  console.log(`Plugin: ${connector.pluginPath}`);
  console.log(`Files written: ${copied.written.length}`);
  console.log(`Files kept: ${copied.kept.length}`);
  if (Object.keys(connector.prompts || {}).length) {
    console.log('Connector prompts:');
    for (const [name, promptPath] of Object.entries(connector.prompts)) {
      console.log(`- ${name}: ${path.relative(PACKAGE_ROOT, path.join(connector.dir, promptPath))}`);
    }
  }
  console.log('Next:');
  for (const item of result.next) console.log(`- ${item}`);
}

function resolveConnector(id) {
  const normalized = String(id || '').toLowerCase();
  return readConnectorRegistry().find(connector => connector.id === normalized || connector.aliases.includes(normalized));
}

function readConnectorRegistry() {
  if (!fs.existsSync(CONNECTORS_ROOT)) return [];
  return fs.readdirSync(CONNECTORS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dir = path.join(CONNECTORS_ROOT, entry.name);
      const manifestPath = path.join(dir, 'connector.json');
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return {
        aliases: [],
        files: 'files',
        prompts: {},
        ...manifest,
        id: manifest.id || entry.name,
        dir,
        manifestPath
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readConnectorPrompts(connector) {
  const prompts = {};
  for (const [name, promptPath] of Object.entries(connector.prompts || {})) {
    const filePath = path.join(connector.dir, promptPath);
    if (fs.existsSync(filePath)) prompts[name] = fs.readFileSync(filePath, 'utf-8');
  }
  return prompts;
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
  const compatibility = runtimeCompatibility(repo, config);
  if (compatibility.level === 'error') {
    issues.push({ level: 'error', path: '.slice/config.json', message: compatibility.message });
  } else if (compatibility.level === 'warn') {
    issues.push({ level: 'warn', path: '.slice/config.json', message: compatibility.message });
  }
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

function printVersion() {
  console.log(JSON.stringify({
    package: 'slice-memory-cli',
    version: PACKAGE_VERSION,
    contract: CONTRACT_VERSION,
    compatibleRuntimeRange: RUNTIME_RANGE
  }, null, 2));
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
  const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    ...config,
    paths: {
      ...DEFAULT_CONFIG.paths,
      ...(config.paths || {})
    },
    runtime: {
      ...DEFAULT_CONFIG.runtime,
      ...(config.runtime || {})
    },
    startup: {
      ...DEFAULT_CONFIG.startup,
      ...(config.startup || {})
    }
  };
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
  return walk(root).filter(file => path.basename(file) === 'PLUGIN.md').map(filePath => {
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
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const listStyle = lines.filter(line => /^\s*-\s+id:/.test(line));
  if (listStyle.length) return listStyle;
  return lines.filter(line => /^[a-z0-9][a-z0-9-]*:\s*$/.test(line));
}

function syncMcpConnectors(repo, config) {
  const pluginsRoot = path.join(repo, config.paths.plugins);
  const examples = findMcpExamples(pluginsRoot);
  const result = { servers: [], written: [], skipped: [] };
  if (!examples.length) return result;

  const mcpServers = {};
  const codexServers = [];
  for (const examplePath of examples) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
    } catch (error) {
      result.skipped.push({ path: path.relative(repo, examplePath), reason: `invalid JSON: ${error.message}` });
      continue;
    }

    const pluginDir = path.dirname(examplePath);
    const plugin = readPluginManifest(pluginDir);
    for (const [serverName, serverConfig] of Object.entries(parsed.mcpServers || {})) {
      const resolved = resolveMcpPlaceholders(serverConfig, repo);
      if (!resolved.command || String(resolved.command).startsWith('/path/to/')) {
        result.skipped.push({ path: path.relative(repo, examplePath), reason: `could not resolve command for ${serverName}` });
        continue;
      }
      mcpServers[serverName] = resolved;
      codexServers.push({ name: serverName, plugin, config: resolved });
      result.servers.push({ name: serverName, plugin: path.relative(repo, pluginDir) });
    }
  }

  if (!Object.keys(mcpServers).length) return result;

  result.written.push(writeProjectMcpConfig(repo, mcpServers));
  result.written.push(writeGeminiMcpConfig(repo, mcpServers));
  try {
    const codexPath = maybeWriteCodexMcpConfig(codexServers);
    if (codexPath) result.written.push(codexPath);
  } catch (error) {
    result.skipped.push({ path: path.join(os.homedir(), '.codex', 'config.toml'), reason: error.message });
  }
  return result;
}

function findMcpExamples(pluginsRoot) {
  if (!fs.existsSync(pluginsRoot)) return [];
  return walk(pluginsRoot).filter(filePath => path.basename(filePath) === 'mcp.json.example');
}

function readPluginManifest(pluginDir) {
  const pluginPath = path.join(pluginDir, 'PLUGIN.md');
  if (!fs.existsSync(pluginPath)) return { frontmatter: {}, filePath: pluginPath };
  const raw = fs.readFileSync(pluginPath, 'utf-8');
  const { frontmatter } = parseMarkdown(raw);
  return {
    filePath: pluginPath,
    frontmatter: {
      ...frontmatter,
      tools: parseList(frontmatter.tools)
    }
  };
}

function resolveMcpPlaceholders(value, repo) {
  if (Array.isArray(value)) return value.map(item => resolveMcpPlaceholders(item, repo));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveMcpPlaceholders(item, repo)])
    );
  }
  if (typeof value !== 'string') return value;
  if (value === '/path/to/uv') return findExecutable('uv') || 'uv';
  return value
    .replaceAll('/path/to/repo', repo)
    .replaceAll('<repo>', repo)
    .replaceAll('${repo}', repo);
}

function findExecutable(command) {
  try {
    return execFileSync('which', [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function writeProjectMcpConfig(repo, servers) {
  const filePath = path.join(repo, '.mcp.json');
  const current = readJsonFile(filePath, { mcpServers: {} });
  current.mcpServers = { ...(current.mcpServers || {}), ...servers };
  writeJsonFile(filePath, current);
  return filePath;
}

function writeGeminiMcpConfig(repo, servers) {
  const filePath = path.join(repo, '.gemini', 'settings.json');
  const current = readJsonFile(filePath, { mcpServers: {} });
  current.mcpServers = current.mcpServers || {};
  for (const [name, server] of Object.entries(servers)) {
    const { type, ...geminiServer } = server;
    current.mcpServers[name] = {
      timeout: 30000,
      trust: false,
      ...(current.mcpServers[name] || {}),
      ...geminiServer
    };
  }
  writeJsonFile(filePath, current);
  return filePath;
}

function maybeWriteCodexMcpConfig(servers) {
  const filePath = path.join(os.homedir(), '.codex', 'config.toml');
  if (!fs.existsSync(filePath)) return null;
  const current = fs.readFileSync(filePath, 'utf-8');
  const names = servers.map(server => server.name);
  const next = `${removeTomlMcpServerBlocks(current, names)}\n\n${servers.map(codexTomlBlock).join('\n')}`.trimEnd() + '\n';
  fs.writeFileSync(filePath, next);
  return filePath;
}

function codexTomlBlock(server) {
  const lines = [
    `[mcp_servers.${server.name}]`,
    `command = "${tomlString(server.config.command)}"`
  ];
  if (Array.isArray(server.config.args)) {
    lines.push('args = [');
    for (const arg of server.config.args) lines.push(`  "${tomlString(String(arg))}",`);
    lines.push(']');
  }
  if (server.config.env && typeof server.config.env === 'object') {
    const envItems = Object.entries(server.config.env)
      .map(([key, value]) => `${key} = "${tomlString(String(value))}"`)
      .join(', ');
    lines.push(`env = { ${envItems} }`);
  }
  lines.push('');
  for (const tool of server.plugin.frontmatter.tools || []) {
    lines.push(`[mcp_servers.${server.name}.tools.${tool}]`);
    lines.push('approval_mode = "approve"');
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function removeTomlMcpServerBlocks(text, serverNames) {
  const output = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      skipping = serverNames.some(name => header[1] === `mcp_servers.${name}` || header[1].startsWith(`mcp_servers.${name}.`));
      if (skipping) continue;
    }
    if (!skipping) output.push(line);
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function tomlString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function copyTemplate(sourceRoot, targetRoot, options = {}) {
  const result = { written: [], kept: [] };
  copyTemplateEntry(sourceRoot, targetRoot, sourceRoot, options, result);
  return result;
}

function copyTemplateEntry(sourcePath, targetRoot, sourceRoot, options, result) {
  const stat = fs.statSync(sourcePath);
  const relative = path.relative(sourceRoot, sourcePath);
  const targetPath = relative ? path.join(targetRoot, relative) : targetRoot;
  if (stat.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyTemplateEntry(path.join(sourcePath, entry), targetRoot, sourceRoot, options, result);
    }
    return;
  }
  if (fs.existsSync(targetPath) && !options.force) {
    result.kept.push(targetPath);
    return;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  result.written.push(targetPath);
}

function compareAtDesc(left, right) {
  return atTime(right) - atTime(left);
}

function atTime(value) {
  const text = String(value || '');
  const match = text.match(/\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/);
  if (!match) return 0;
  const normalized = match[0].replace(' ', 'T');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? 0 : time;
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

function runtimeCompatibility(repo = null, config = null) {
  let resolvedRepo = repo;
  let resolvedConfig = config;
  if (!resolvedRepo || !resolvedConfig) {
    try {
      resolvedRepo = findRepo();
      resolvedConfig = readConfig(resolvedRepo);
    } catch {
      return {
        level: 'warn',
        status: 'unchecked',
        requiredRange: RUNTIME_RANGE,
        requiredContract: CONTRACT_VERSION,
        message: 'Could not find .slice/config.json; runtime compatibility was not checked.'
      };
    }
  }

  const requiredRange = resolvedConfig.runtime?.version || RUNTIME_RANGE;
  const requiredContract = resolvedConfig.runtime?.contract || CONTRACT_VERSION;
  if (requiredContract !== CONTRACT_VERSION) {
    return {
      level: 'error',
      status: 'blocked',
      requiredRange,
      requiredContract,
      message: `Slice contract mismatch: repo requires ${requiredContract}, CLI provides ${CONTRACT_VERSION}.`
    };
  }

  if (!satisfiesRuntimeRange(PACKAGE_VERSION, requiredRange)) {
    return {
      level: 'error',
      status: 'blocked',
      requiredRange,
      requiredContract,
      message: `Slice runtime version mismatch: repo requires ${requiredRange}, CLI is ${PACKAGE_VERSION}.`
    };
  }

  return {
    level: 'ok',
    status: 'ok',
    requiredRange,
    requiredContract,
    message: `Slice runtime ${PACKAGE_VERSION} satisfies ${requiredRange}.`
  };
}

function satisfiesRuntimeRange(version, range) {
  const constraints = String(range || '').split(/\s+/).filter(Boolean);
  if (!constraints.length) return true;
  return constraints.every(constraint => {
    if (constraint.startsWith('>=')) return compareVersions(version, constraint.slice(2)) >= 0;
    if (constraint.startsWith('>')) return compareVersions(version, constraint.slice(1)) > 0;
    if (constraint.startsWith('<=')) return compareVersions(version, constraint.slice(2)) <= 0;
    if (constraint.startsWith('<')) return compareVersions(version, constraint.slice(1)) < 0;
    if (constraint.startsWith('^')) return satisfiesCaret(version, constraint.slice(1));
    return compareVersions(version, constraint) === 0;
  });
}

function satisfiesCaret(version, base) {
  const parsed = parseVersion(base);
  if (!parsed) return false;
  const upper = parsed.major === 0
    ? `${parsed.major}.${parsed.minor + 1}.0`
    : `${parsed.major + 1}.0.0`;
  return compareVersions(version, base) >= 0 && compareVersions(version, upper) < 0;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return Number.NaN;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }
  return 0;
}

function parseVersion(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content);
}

function agentsTemplate() {
  return `# Slice Memory Contract

You are the user's Slice memory partner. Treat this repository as a \`slice\` repo initialized by the shared Slice runtime.

## System Model

Slice is a deterministic memory system that captures life as discrete \`slices\`.

- **Slices**: Source memory; one subject in one context. Stored in \`slices/YYYY/MM/\`.
- **Entities**: People, projects, and concepts linked via \`[[wikilinks]]\`.
- **Stories**: Intentional views over slices, drafts, syntheses, essays, or manually maintained surfaces.
- **Plugins**: Folder-based lifecycle instructions and repo-local extensions under \`.slice/plugins/*/PLUGIN.md\`.

## Runtime

Use the published Slice CLI instead of repo-local runtime scripts.

Prefer an installed \`slice\` command when available. If not available, run it through npm:

\`\`\`bash
npm exec --yes --package=slice-memory-cli@latest -- slice <command>
\`\`\`

## Operational Instructions

1. **Initialization**: Run \`slice briefing\` on the first turn of every session.
2. **Retrieval**: When context is needed, run \`slice retrieve search <query>\` or \`slice retrieve recent [N]\`.
3. **Capture**: When new durable facts or thoughts should be written, run \`slice slice capture "<subject>" "<at>" "<content>"\`.
4. **Collect**: Keep \`stories/\` and \`entities/registry.yaml\` as collected views over source slices. Stories are not mandatory plugin output; they can be manually maintained long-running surfaces.
5. **Plugin Lifecycle**: At lifecycle points, run \`slice lifecycle run <event>\` and apply relevant \`.slice/plugins/*/PLUGIN.md\` instructions.
6. **Connector Setup**: \`slice context <agent>\` automatically syncs repo-local MCP connector examples from plugin folders into local MCP client config. Use \`slice connectors sync\` to repair connector setup directly.
7. **Extension Setup**: Put connector, tool, script, MCP, and view-specific behavior inside plugin folders instead of adding new top-level runtime directories.
8. **Validation**: Run \`slice validate\` after any memory file write.
9. **Closure**: Follow the slice boundary rule: same subject plus same context stays in the same slice; otherwise create a new slice.

## Operating Loop

1. Start with \`slice briefing\`.
2. Retrieve only the memory needed for the current turn.
3. Answer or act using live context first and retrieved memory second.
4. Capture durable source memory as a slice when appropriate.
5. Collect source memory into stories or entities only when it creates a useful view.
6. Run lifecycle plugins when the turn reaches \`session_start\`, \`after_capture\`, \`after_turn\`, or another configured event.
7. Validate after writes.

## Toolset

- **Briefing**: \`slice briefing\`
- **Search**: \`slice retrieve search <query>\`
- **Recent**: \`slice retrieve recent [N]\`
- **Capture**: \`slice slice capture "<subject>" "<at>" "<content>"\`
- **Lifecycle**: \`slice lifecycle run <event>\`
- **Connectors**: \`slice connectors list\`, \`slice connectors show <connector>\`, \`slice connectors install <connector>\`, \`slice connectors sync\`
- **Validate**: \`slice validate\`

## Operating Rules

- **Strict Verification (SVP)**: Every claim about memory or strategy MUST include a Traceability Table.
- **Literalism**: Use exact quotes. Do not synthesize intent or causal links across time gaps.
- **No Inference**: Do not add advice, summaries, or next steps unless explicitly requested.
- **Temporal Integrity**: Present events in chronological order and respect the time gaps between slices.
`;
}

function bootloaderTemplate(agentName) {
  return `# Slice - ${agentName} Bootstrap

Required Slice runtime: ${RUNTIME_RANGE}
Required Slice contract: ${CONTRACT_VERSION}

Load the current Slice operating contract from the CLI, then follow it exactly.

On the first turn of every session:

1. Run \`slice context ${agentName}\`.
2. If \`slice\` is unavailable, run:

\`\`\`bash
npm exec --yes --package=slice-memory-cli@latest -- slice context ${agentName}
\`\`\`

3. Follow the printed contract.
4. If neither command works, report that the Slice runtime contract could not be loaded and do not improvise memory behavior.
`;
}

function agentContextTemplate(agentName, compatibility = null) {
  const status = compatibility
    ? `Runtime compatibility: ${compatibility.status} (cli ${PACKAGE_VERSION}, repo ${compatibility.requiredRange}, contract ${compatibility.requiredContract})`
    : `Runtime compatibility: unchecked (cli ${PACKAGE_VERSION}, contract ${CONTRACT_VERSION})`;
  return `# Slice - ${agentName} Context

This context is generated by the Slice CLI. Treat it as the current operating contract for this repo.

${status}

${agentsTemplate().trim()}
`;
}

function normalizeAgentName(value) {
  const text = String(value || 'Agent').toLowerCase();
  if (text === 'claude') return 'Claude';
  if (text === 'codex') return 'Codex';
  if (text === 'gemini') return 'Gemini';
  return 'Agent';
}

function sliceSkillTemplate(agent) {
  const name = agent === 'claude' ? 'slice' : 'slice';
  return `---
name: ${name}
description: Use when working in this Slice repo to retrieve context, capture or update slices, maintain entities/stories, run lifecycle plugins, run startup briefing, or validate memory files.
---

# Slice

Use this skill for Slice memory work in this repo.

\`AGENTS.md\` is the canonical always-loaded instruction. \`.slice/config.json\` defines repo paths. Lifecycle behavior lives in \`.slice/plugins/*/PLUGIN.md\`.

Plugins are the extension boundary. If a repo needs external context, account setup, OAuth, MCP, scripts, or tool wrappers, keep the contract and implementation under a plugin folder.

## Commands

Prefer an installed \`slice\` command. If it is not available, use:

\`\`\`bash
npm exec --yes --package=slice-memory-cli@latest -- slice <command>
\`\`\`

Common commands:

\`\`\`bash
slice briefing
slice retrieve search <query>
slice retrieve recent [N]
slice slice capture <subject> <at> <content>
slice lifecycle run <event>
slice validate
\`\`\`

## Startup

At session start, run \`slice briefing\`.

Read only the files needed for the user's current turn. Use lifecycle plugins when the turn reaches \`session_start\`, \`after_capture\`, or \`after_turn\`.

## Retrieval

Before personal, reflective, planning, decision-heavy, or continuity-dependent answers:

1. Run \`slice retrieve search <query>\`.
2. Open only the highest-signal results.
3. Quote source text exactly when making memory claims.

## Capture

Capture durable material as slices. Use \`slices/YYYY/MM/slice-YYYY-MM-DD-kebab-subject.md\`.

Before writing:

1. Decide whether the turn continues a current-session subject, starts a new subject, or should stay uncaptured.
2. Ask before writing sensitive durable material, venting, stable identity changes, or inferred material beyond what the user grounded.
3. Resolve clear entities through \`entities/registry.yaml\`; leave ambiguous mentions plain.

After writing:

\`\`\`bash
slice validate
slice lifecycle run after_capture
\`\`\`

## Stories

Stories are flexible views, not source memory. Create or update stories only when useful as a view over slices.

## Plugins

Plugins are folders under \`.slice/plugins\`. Each plugin owns a \`PLUGIN.md\` with frontmatter triggers and instruction body. Optional plugin-local files may include \`tools/\`, \`scripts/\`, \`mcp.json.example\`, templates, or generated scratch paths. Run \`slice lifecycle run <event>\` to discover relevant plugins, then apply each plugin's When/Do/Output sections if relevant.
`;
}

function geminiExtensionTemplate() {
  return JSON.stringify({
    name: 'slice',
    version: '1.0.0',
    contextFileName: 'GEMINI.md',
    description: 'Slice memory runtime instructions. Use GEMINI.md and .slice/plugins/*/PLUGIN.md for repo behavior.'
  }, null, 2) + '\n';
}

function gitignoreTemplate() {
  return `node_modules/
.DS_Store
.slice/runtime/
.mcp.json
.gemini/settings.json

# local OAuth secrets
credentials.json
token.json
`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
