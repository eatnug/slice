import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const PACKAGE_VERSION = '0.1.9';
const CONTRACT_VERSION = 'slice-memory@0.1';
const RUNTIME_RANGE = '>=0.1.9 <0.2.0';
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONNECTORS_ROOT = path.join(PACKAGE_ROOT, 'templates', 'connectors');
const WALK_IGNORED_DIRS = new Set(['.git', 'node_modules', '.pnpm', 'dist', 'build', '.next', '.turbo']);
const ENTITY_STOPWORDS = new Set([
  'i',
  'me',
  'mine',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'him',
  'she',
  'her',
  'they',
  'them',
  'it',
  'this',
  'that',
  'there',
  'here',
  'thing',
  'things',
  'something'
]);

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
  if (command === 'entities') return entities(rest);
  if (command === 'connectors') return connectors(rest);
  if (command === 'thought-map') return thoughtMap(rest);
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
  slice entities list [--json]
  slice entities show <entity> [--json]
  slice connectors list
  slice connectors show <connector> [--json]
  slice connectors install <connector> [--force] [--json]
  slice connectors sync [--json]
  slice thought-map [--port N] [--host HOST] [--json]
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
At session_start, read stories/todo.md if it exists to orient to Handling Now, Open Loop, and Done items.

At after_capture, update stories/todo.md immediately when the captured slice records something as done, sent, replied, posted, deferred, waiting, blocked, urgent, newly relevant, or otherwise changes active attention.

At after_turn, update stories/todo.md immediately when the user asks what to do next, asks to organize open loops, handles or closes an active todo item, moves an item into waiting/deferred state, or the active set should shrink, clear, or be refilled.

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

function entities(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === 'list' || !subcommand) return listEntities(rest);
  if (subcommand === 'show') return showEntity(rest);
  fail('Usage: slice entities list [--json] | slice entities show <entity> [--json]');
}

function listEntities(args) {
  const repo = findRepo();
  const config = readConfig(repo);
  const json = args.includes('--json');
  const entries = readEntityRegistry(path.join(repo, config.paths.entitiesRegistry));
  const payload = entries.map(entry => ({
    id: entry.id,
    label: entry.label || entry.id,
    aliases: entry.aliases || [],
    firstSeen: entry.first_seen || '',
    lastSeen: entry.last_seen || '',
    slices: entry.slices || []
  }));
  if (json) return console.log(JSON.stringify(payload, null, 2));
  console.log(`Entities (${payload.length})`);
  for (const entry of payload) {
    const slices = entry.slices.length ? `, ${entry.slices.length} slice(s)` : '';
    console.log(`- ${entry.id}: ${entry.label}${slices}`);
  }
}

function showEntity(args) {
  const query = args.find(arg => !arg.startsWith('--'));
  if (!query) fail('Usage: slice entities show <entity> [--json]');
  const repo = findRepo();
  const config = readConfig(repo);
  const json = args.includes('--json');
  const entries = readEntityRegistry(path.join(repo, config.paths.entitiesRegistry));
  const match = resolveExistingEntity(entries, { label: query, idHint: normalizeEntityId(query) });
  if (!match) fail(`Unknown entity: ${query}`);
  const payload = {
    id: match.entry.id,
    label: match.entry.label || match.entry.id,
    aliases: match.entry.aliases || [],
    firstSeen: match.entry.first_seen || '',
    lastSeen: match.entry.last_seen || '',
    slices: match.entry.slices || [],
    match: match.reason
  };
  if (json) return console.log(JSON.stringify(payload, null, 2));
  console.log(`${payload.id}: ${payload.label}`);
  if (payload.aliases.length) console.log(`Aliases: ${payload.aliases.join(', ')}`);
  if (payload.firstSeen || payload.lastSeen) console.log(`Seen: ${payload.firstSeen || 'unknown'} -> ${payload.lastSeen || 'unknown'}`);
  if (payload.slices.length) {
    console.log('Slices:');
    for (const item of payload.slices) console.log(`- ${item}`);
  }
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

function thoughtMap(args) {
  const repo = findRepo();
  const config = readConfig(repo);
  const payload = buildThoughtMapPayload(repo, config);
  if (args.includes('--json')) return console.log(JSON.stringify(payload, null, 2));

  const host = stringArg(args, '--host', '127.0.0.1');
  const port = numberArg(args, '--port', 3717);
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
      const html = renderThoughtMapHtml();
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(req.method === 'HEAD' ? '' : html);
      return;
    }

    if (requestUrl.pathname === '/api/data') {
      const freshPayload = buildThoughtMapPayload(repo, config);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(req.method === 'HEAD' ? '' : JSON.stringify(freshPayload));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Memory Graph running at http://${host}:${actualPort}`);
    console.log(`Repo: ${repo}`);
    console.log(`Graph: ${payload.graph.nodes.length} nodes, ${payload.graph.links.length} links`);
  });
}

function buildThoughtMapPayload(repo, config) {
  const slices = readMarkdownTree(path.join(repo, config.paths.slices), 'slice');
  const stories = readMarkdownTree(path.join(repo, config.paths.stories), 'story');
  const entities = readEntityRegistry(path.join(repo, config.paths.entitiesRegistry));
  const registryById = new Map(entities.map(entry => [entry.id, entry]));
  const nodes = new Map();
  const links = new Map();

  for (const entry of entities) {
    addThoughtNode(nodes, {
      id: thoughtEntityId(entry.id),
      type: 'entity',
      title: entry.label || labelFromEntityId(entry.id),
      entityId: entry.id,
      aliases: entry.aliases || [],
      firstSeen: entry.first_seen || '',
      lastSeen: entry.last_seen || '',
      path: '',
      at: '',
      excerpt: (entry.aliases || []).length ? `Aliases: ${entry.aliases.join(', ')}` : 'Entity from registry.',
      content: ''
    });
  }

  for (const note of [...slices, ...stories]) {
    const relativePath = path.relative(repo, note.filePath);
    const nodeId = thoughtNoteId(note.space, relativePath);
    const noteEntities = uniqueStrings([
      ...parseList(note.frontmatter.entities),
      ...extractWikilinkEntityIds(`${note.title}\n${note.body}`)
    ]);

    addThoughtNode(nodes, {
      id: nodeId,
      type: note.space,
      title: cleanMarkdownInline(note.title),
      path: relativePath,
      at: String(note.frontmatter.at || ''),
      open: note.frontmatter.open !== 'false' && note.frontmatter.open !== false,
      entityIds: noteEntities,
      excerpt: noteExcerpt(note.body),
      content: note.body.trim().slice(0, 2800)
    });

    for (const entityId of noteEntities) {
      const resolved = resolveThoughtEntityId(entityId, registryById);
      const entity = registryById.get(resolved);
      addThoughtNode(nodes, {
        id: thoughtEntityId(resolved),
        type: 'entity',
        title: entity?.label || labelFromEntityId(resolved),
        entityId: resolved,
        aliases: entity?.aliases || [],
        firstSeen: entity?.first_seen || '',
        lastSeen: entity?.last_seen || '',
        path: '',
        at: '',
        excerpt: entity?.aliases?.length ? `Aliases: ${entity.aliases.join(', ')}` : 'Entity inferred from note text.',
        content: ''
      });
      addThoughtLink(links, {
        source: nodeId,
        target: thoughtEntityId(resolved),
        type: 'mentions',
        label: note.space === 'slice' ? 'slice mentions entity' : 'story mentions entity',
        weight: note.space === 'slice' ? 1.2 : 0.9
      });
    }
  }

  for (const entry of entities) {
    for (const slicePath of entry.slices || []) {
      const sliceId = thoughtNoteId('slice', slicePath);
      if (!nodes.has(sliceId)) continue;
      addThoughtLink(links, {
        source: thoughtEntityId(entry.id),
        target: sliceId,
        type: 'registry',
        label: 'registry usage',
        weight: 1.6
      });
    }
  }

  addSharedEntityLinks(nodes, links);

  const nodeList = [...nodes.values()].map(node => ({
    ...node,
    degree: [...links.values()].filter(link => link.source === node.id || link.target === node.id).length,
    searchText: [
      node.title,
      node.type,
      node.path,
      node.entityId,
      ...(node.aliases || []),
      ...(node.entityIds || []),
      node.excerpt
    ].filter(Boolean).join(' ').toLowerCase()
  }));

  return {
    meta: {
      title: 'Memory Graph',
      repo,
      generatedAt: new Date().toISOString(),
      counts: {
        slices: slices.length,
        stories: stories.length,
        entities: entities.length,
        nodes: nodeList.length,
        links: links.size
      }
    },
    graph: {
      nodes: nodeList.sort((left, right) => thoughtNodeRank(left) - thoughtNodeRank(right) || left.title.localeCompare(right.title)),
      links: [...links.values()].sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`))
    }
  };
}

function addThoughtNode(nodes, node) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, {
      aliases: [],
      entityIds: [],
      ...node
    });
    return;
  }
  nodes.set(node.id, {
    ...existing,
    ...Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined && value !== null && value !== '')),
    aliases: uniqueStrings([...(existing.aliases || []), ...(node.aliases || [])]),
    entityIds: uniqueStrings([...(existing.entityIds || []), ...(node.entityIds || [])])
  });
}

function addThoughtLink(links, link) {
  if (link.source === link.target) return;
  const ordered = [link.source, link.target].sort();
  const key = `${ordered[0]}::${ordered[1]}::${link.type}`;
  const existing = links.get(key);
  if (!existing) {
    links.set(key, link);
    return;
  }
  existing.weight = Math.max(existing.weight || 1, link.weight || 1);
}

function addSharedEntityLinks(nodes, links) {
  const notesByEntity = new Map();
  for (const node of nodes.values()) {
    if (node.type !== 'slice' && node.type !== 'story') continue;
    for (const entityId of node.entityIds || []) {
      const list = notesByEntity.get(entityId) || [];
      list.push(node);
      notesByEntity.set(entityId, list);
    }
  }

  for (const [entityId, notes] of notesByEntity.entries()) {
    const limited = notes
      .sort((left, right) => String(right.at || '').localeCompare(String(left.at || '')))
      .slice(0, 8);
    for (let index = 0; index < limited.length - 1; index += 1) {
      addThoughtLink(links, {
        source: limited[index].id,
        target: limited[index + 1].id,
        type: 'shared-entity',
        label: `shared ${entityId}`,
        weight: 0.35
      });
    }
  }
}

function thoughtNodeRank(node) {
  if (node.type === 'entity') return 0;
  if (node.type === 'slice') return 1;
  return 2;
}

function thoughtEntityId(entityId) {
  return `entity:${normalizeEntityId(entityId)}`;
}

function thoughtNoteId(type, relativePath) {
  return `${type}:${relativePath.replaceAll(path.sep, '/')}`;
}

function resolveThoughtEntityId(entityId, registryById) {
  const normalized = normalizeEntityId(entityId);
  if (registryById.has(normalized)) return normalized;
  const resolved = resolveExistingEntity([...registryById.values()], {
    id: normalized,
    idHint: normalized,
    label: labelFromEntityId(normalized),
    aliases: [entityId]
  });
  return resolved?.entry?.id || normalized;
}

function extractWikilinkEntityIds(text) {
  return Array.from(String(text || '').matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g))
    .map(match => normalizeEntityId(match[1]))
    .filter(Boolean);
}

function noteExcerpt(body) {
  const line = String(body || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .find(item => !item.startsWith('#') && !/^---+$/.test(item));
  return cleanMarkdownInline(line || '').slice(0, 260);
}

function cleanMarkdownInline(value) {
  return String(value || '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => label || labelFromEntityId(id))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderThoughtMapHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memory Graph</title>
  <style>${thoughtMapStyles()}</style>
</head>
<body>
  <main class="app-shell">
    <section class="graph-stage" aria-label="Memory graph">
      <canvas id="graph-canvas"></canvas>
      <div id="focus-popover" class="focus-popover hidden" aria-hidden="true"></div>
      <div class="topbar">
        <div class="stats" id="stats"></div>
      </div>
    </section>

    <aside class="inspector-panel" aria-label="Inspector">
      <section class="search-card">
        <form id="conversation-form" class="conversation-form">
          <input id="conversation-input" autocomplete="off" placeholder="Search memory..." />
        </form>
        <p id="search-status" class="support-text">Search or click a node.</p>
      </section>

      <section class="detail-card">
        <div id="selection-detail" class="selection-detail">
          <h2>No node selected</h2>
          <p>Click a graph node or search for a topic.</p>
        </div>
      </section>
    </aside>
  </main>
  <script>${thoughtMapClientScript()}</script>
</body>
</html>`;
}

function thoughtMapStyles() {
  return `
    :root {
      color-scheme: dark;
      --bg: #090a0c;
      --panel: rgba(12, 13, 16, 0.58);
      --panel-strong: rgba(16, 17, 20, 0.78);
      --line: rgba(255, 255, 255, 0.08);
      --text: #f3f0e8;
      --muted: #a5a09a;
      --amber: #d8c58a;
      --green: #7ee6a9;
      --cyan: #7bc8ff;
      --rose: #ff8e9e;
      --violet: #b8a1ff;
      --shadow: 0 28px 90px rgba(0, 0, 0, 0.34);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
    }

    button,
    input {
      font: inherit;
    }

    .app-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      min-height: 100vh;
    }

    .graph-stage {
      position: relative;
      min-width: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 38% 38%, rgba(123, 200, 255, 0.11), transparent 28%),
        radial-gradient(circle at 72% 22%, rgba(255, 142, 158, 0.08), transparent 24%),
        linear-gradient(145deg, #090a0c, #111114 56%, #0b0d10);
    }

    #graph-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      cursor: grab;
    }

    #graph-canvas.dragging { cursor: grabbing; }

    .topbar {
      position: absolute;
      top: 24px;
      left: 24px;
      right: 24px;
      display: flex;
      justify-content: flex-end;
      gap: 18px;
      pointer-events: none;
    }

    .detail-card h2 {
      margin: 0;
      letter-spacing: 0;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: var(--amber);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-content: flex-start;
      gap: 8px;
      max-width: 320px;
    }

    .stat-pill {
      padding: 7px 9px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 6px;
      color: rgba(243, 240, 232, 0.68);
      background: rgba(8, 9, 11, 0.24);
      backdrop-filter: blur(18px);
      font-size: 0.78rem;
    }

    .inspector-panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0;
      min-height: 100vh;
      padding: 0;
      background:
        linear-gradient(180deg, rgba(13, 14, 17, 0.84), rgba(8, 9, 11, 0.78)),
        radial-gradient(circle at 20% 0%, rgba(123, 200, 255, 0.09), transparent 28%);
      border-left: 1px solid rgba(255, 255, 255, 0.07);
      box-shadow: -18px 0 70px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(26px);
      overflow: hidden;
    }

    .search-card,
    .detail-card {
      min-width: 0;
      background: transparent;
    }

    .support-text,
    .selection-detail {
      color: var(--muted);
      line-height: 1.5;
    }

    .support-text {
      margin: 0;
      color: rgba(243, 240, 232, 0.5);
      font-size: 0.8rem;
    }

    .conversation-form {
      display: block;
    }

    .conversation-form input {
      min-width: 0;
      width: 100%;
      height: 40px;
      padding: 0 13px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 7px;
      color: rgba(243, 240, 232, 0.94);
      background: rgba(255, 255, 255, 0.045);
      outline: 0;
    }

    .conversation-form input:focus {
      border-color: rgba(123, 200, 255, 0.42);
      background: rgba(123, 200, 255, 0.055);
    }

    .search-card {
      display: grid;
      gap: 9px;
      padding: 18px 18px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.065);
    }

    .detail-card {
      min-height: 0;
      overflow: auto;
      padding: 20px 18px 22px;
    }

    .selection-detail h2 {
      margin-bottom: 12px;
      color: var(--text);
      font-size: 1.1rem;
      line-height: 1.2;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 10px 0;
    }

    .meta-row span {
      padding: 4px 7px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.045);
      color: rgba(243, 240, 232, 0.56);
      font-size: 0.74rem;
    }

    .connected-list {
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 6px;
    }

    .connected-list li {
      padding: 8px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.055);
      color: rgba(243, 240, 232, 0.62);
      font-size: 0.82rem;
    }

    .focus-popover {
      position: absolute;
      z-index: 3;
      max-width: min(330px, 42vw);
      padding: 12px 14px;
      border: 1px solid rgba(255, 142, 158, 0.36);
      border-radius: 8px;
      color: var(--muted);
      background: rgba(13, 14, 17, 0.84);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(20px);
      pointer-events: none;
      transform: translate(-50%, calc(-100% - 20px));
      transition: opacity 160ms ease;
    }

    .focus-popover.hidden {
      opacity: 0;
    }

    .focus-popover h3 {
      margin: 0 0 6px;
      color: var(--text);
      font-size: 0.98rem;
      line-height: 1.18;
    }

    .focus-popover p {
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 0.82rem;
      line-height: 1.45;
    }

    .focus-popover .meta-row {
      margin: 8px 0 0;
    }

    .selection-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .clear-focus-button {
      min-height: 32px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 7px;
      color: rgba(243, 240, 232, 0.72);
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
    }

    @media (max-width: 980px) {
      body { overflow: auto; }
      .app-shell { grid-template-columns: 1fr; }
      .graph-stage { min-height: 62vh; }
      .inspector-panel {
        min-height: 620px;
        border-left: 0;
        border-top: 1px solid var(--line);
      }
      .topbar { flex-direction: column; }
    }
  `;
}

function thoughtMapClientScript() {
  return `
    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d');
    const state = {
      data: null,
      nodes: [],
      links: [],
      positions: new Map(),
      orientation: createInitialOrientation(),
      orbitPhase: 0.4,
      zoom: 1,
      zoomTarget: 1,
      zoomPulse: 0,
      hoverId: null,
      selectedId: null,
      focusIds: new Set(),
      focusTransitionId: null,
      filter: 'all',
      pointerDown: false,
      pointerMoved: false,
      dragging: false,
      lastPointer: null,
      searchMessage: ''
    };

    const colors = {
      slice: '#7bc8ff',
      entity: '#f3c969',
      story: '#7ee6a9',
      selected: '#ff8e9e',
      dim: 'rgba(255,255,255,0.18)'
    };

    async function boot() {
      const response = await fetch('/api/data');
      state.data = await response.json();
      state.nodes = state.data.graph.nodes;
      state.links = state.data.graph.links;
      assignSpherePositions();
      hydrateHeader();
      resize();
      requestAnimationFrame(frame);
    }

    function hydrateHeader() {
      const counts = state.data.meta.counts;
      document.getElementById('stats').innerHTML = [
        ['Slices', counts.slices],
        ['Stories', counts.stories],
        ['Entities', counts.entities],
        ['Links', counts.links]
      ].map(function(item) {
        return '<span class="stat-pill">' + item[0] + ' ' + item[1] + '</span>';
      }).join('');
    }

    function assignSpherePositions() {
      const sorted = [...state.nodes].sort(function(left, right) {
        return stableHash(left.id) - stableHash(right.id);
      });
      const count = Math.max(sorted.length, 1);
      const golden = Math.PI * (3 - Math.sqrt(5));
      sorted.forEach(function(node, index) {
        const y = 1 - (index / Math.max(count - 1, 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = golden * index;
        const shellJitter = (stableHash(node.id + ':shell') % 100) / 1000;
        const shell = 0.94 + shellJitter;
        state.positions.set(node.id, {
          x: Math.cos(theta) * radius * shell,
          y: y * shell,
          z: Math.sin(theta) * radius * shell,
          sx: 0,
          sy: 0,
          depth: 0
        });
      });
    }

    function stableHash(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function frame() {
      state.zoom += (state.zoomTarget - state.zoom) * 0.22;
      state.zoomPulse *= 0.86;
      if (!state.dragging && state.focusTransitionId) {
        if (!easeFocusIntoView(state.focusTransitionId)) state.focusTransitionId = null;
      } else if (!state.dragging && !hasActiveFocus()) {
        rotateAroundScreenAxis([0, 1, 0], 0.00075);
      }
      draw();
      requestAnimationFrame(frame);
    }

    function hasActiveFocus() {
      return Boolean(state.selectedId || state.focusIds.size);
    }

    function createInitialOrientation() {
      return multiplyMatrices(rotationMatrixX(-0.22), rotationMatrixY(0.4));
    }

    function rotationMatrixX(angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [
        1, 0, 0,
        0, cos, -sin,
        0, sin, cos
      ];
    }

    function rotationMatrixY(angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [
        cos, 0, -sin,
        0, 1, 0,
        sin, 0, cos
      ];
    }

    function multiplyMatrices(left, right) {
      return [
        left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
        left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
        left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
        left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
        left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
        left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
        left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
        left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
        left[6] * right[2] + left[7] * right[5] + left[8] * right[8]
      ];
    }

    function applyMatrix(matrix, position) {
      return {
        x: matrix[0] * position.x + matrix[1] * position.y + matrix[2] * position.z,
        y: matrix[3] * position.x + matrix[4] * position.y + matrix[5] * position.z,
        z: matrix[6] * position.x + matrix[7] * position.y + matrix[8] * position.z
      };
    }

    function rotateAroundScreenAxis(axis, angle) {
      if (!angle) return;
      state.orientation = normalizeMatrix(multiplyMatrices(rotationMatrixAxis(axis, angle), state.orientation));
      state.orbitPhase += angle;
    }

    function rotateArcball(from, to) {
      const axis = crossVectors(from, to);
      const length = Math.hypot(axis[0], axis[1], axis[2]);
      if (length < 0.0001) return;
      const angle = Math.atan2(length, clamp(dotVectors(from, to), -1, 1));
      rotateAroundScreenAxis(axis, angle);
    }

    function easeFocusIntoView(id) {
      const position = state.positions.get(id);
      if (!position) return false;
      const rotated = normalizeVector(Object.values(applyMatrix(state.orientation, position)));
      const target = normalizeVector([0, 0.08, 1]);
      const axis = crossVectors(rotated, target);
      const length = Math.hypot(axis[0], axis[1], axis[2]);
      const remaining = Math.atan2(length, clamp(dotVectors(rotated, target), -1, 1));
      if (remaining < 0.004) return false;
      rotateAroundScreenAxis(axis, Math.min(remaining, Math.max(0.004, remaining * 0.12)));
      return true;
    }

    function rotationMatrixAxis(axis, angle) {
      const normalized = normalizeVector(axis);
      const x = normalized[0];
      const y = normalized[1];
      const z = normalized[2];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const t = 1 - cos;
      return [
        t * x * x + cos, t * x * y - sin * z, t * x * z + sin * y,
        t * x * y + sin * z, t * y * y + cos, t * y * z - sin * x,
        t * x * z - sin * y, t * y * z + sin * x, t * z * z + cos
      ];
    }

    function arcballVector(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const radius = Math.max(120, Math.min(rect.width, rect.height) * 0.42 * state.zoom);
      let x = (clientX - rect.left - rect.width / 2) / radius;
      let y = (clientY - rect.top - rect.height / 2) / radius;
      const lengthSquared = x * x + y * y;
      if (lengthSquared > 1) {
        const length = Math.sqrt(lengthSquared);
        return [x / length, y / length, 0];
      }
      return [x, y, Math.sqrt(1 - lengthSquared)];
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function zoomVisualScale() {
      return clamp(Math.pow(state.zoom, 0.55), 0.72, 1.62);
    }

    function normalizeMatrix(matrix) {
      let x = normalizeVector([matrix[0], matrix[1], matrix[2]]);
      let y = [matrix[3], matrix[4], matrix[5]];
      y = subtractVectors(y, scaleVector(x, dotVectors(x, y)));
      y = normalizeVector(y);
      const z = crossVectors(x, y);
      return [
        x[0], x[1], x[2],
        y[0], y[1], y[2],
        z[0], z[1], z[2]
      ];
    }

    function normalizeVector(vector) {
      const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
      return [vector[0] / length, vector[1] / length, vector[2] / length];
    }

    function dotVectors(left, right) {
      return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
    }

    function scaleVector(vector, scale) {
      return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
    }

    function subtractVectors(left, right) {
      return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
    }

    function crossVectors(left, right) {
      return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
      ];
    }

    function visibleNode(node) {
      if (state.filter === 'all') return true;
      if (node.type === state.filter) return true;
      if (node.id === state.selectedId || state.focusIds.has(node.id)) return true;
      return isFocusNeighbor(node.id);
    }

    function isFocusNeighbor(nodeId) {
      if (!state.focusIds.size && !state.selectedId) return false;
      return state.links.some(function(link) {
        const sourceFocused = state.focusIds.has(link.source) || link.source === state.selectedId;
        const targetFocused = state.focusIds.has(link.target) || link.target === state.selectedId;
        return (sourceFocused && link.target === nodeId) || (targetFocused && link.source === nodeId);
      });
    }

    function project(position) {
      const rotated = applyMatrix(state.orientation, position);
      const rect = canvas.getBoundingClientRect();
      const perspective = 1.9 / (2.48 - rotated.z);
      const scale = Math.min(rect.width, rect.height) * 0.34 * state.zoom;
      return {
        sx: rect.width / 2 + rotated.x * scale * perspective,
        sy: rect.height / 2 + rotated.y * scale * perspective,
        depth: rotated.z,
        perspective: perspective
      };
    }

    function draw() {
      const rect = canvas.getBoundingClientRect();
      const pulse = 0.5 + Math.sin(performance.now() * 0.0026) * 0.5;
      const focusPulse = hasActiveFocus() ? pulse : 0;
      const zoomScale = zoomVisualScale();
      const zoomPulse = state.zoomPulse;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = 'rgba(8, 9, 11, 0.5)';
      ctx.fillRect(0, 0, rect.width, rect.height);
      drawGlobeGuide(rect);

      const visible = new Set(state.nodes.filter(visibleNode).map(function(node) { return node.id; }));
      for (const node of state.nodes) {
        const position = state.positions.get(node.id);
        if (!position) continue;
        const projected = project(position);
        position.sx = projected.sx;
        position.sy = projected.sy;
        position.depth = projected.depth;
        position.perspective = projected.perspective;
      }

      const sortedLinks = state.links.filter(function(link) {
        return visible.has(link.source) && visible.has(link.target);
      }).sort(function(left, right) {
        const lp = state.positions.get(left.source);
        const rp = state.positions.get(right.source);
        return (lp?.depth || 0) - (rp?.depth || 0);
      });

      for (const link of sortedLinks) {
        const source = state.positions.get(link.source);
        const target = state.positions.get(link.target);
        if (!source || !target) continue;
        const strong = linkTouchesFocus(link);
        const muted = hasActiveFocus() && !strong;
        const strongAlpha = 0.42 + focusPulse * 0.1;
        ctx.beginPath();
        ctx.moveTo(source.sx, source.sy);
        ctx.lineTo(target.sx, target.sy);
        ctx.strokeStyle = strong ? 'rgba(216, 197, 138, ' + strongAlpha + ')' : muted ? 'rgba(255, 255, 255, 0.016)' : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = (strong ? 1.45 + focusPulse * 0.16 : muted ? 0.4 : 0.62) * Math.max(0.78, zoomScale * 0.9);
        ctx.stroke();
      }

      const sortedNodes = state.nodes.filter(function(node) {
        return visible.has(node.id);
      }).sort(function(left, right) {
        return (state.positions.get(left.id)?.depth || 0) - (state.positions.get(right.id)?.depth || 0);
      });

      for (const node of sortedNodes) {
        const position = state.positions.get(node.id);
        if (!position) continue;
        const selected = node.id === state.selectedId;
        const focused = state.focusIds.has(node.id);
        const neighbor = isFocusNeighbor(node.id);
        const hovered = node.id === state.hoverId;
        const distant = hasActiveFocus() && !selected && !focused && !neighbor;
        const base = 4.8 + Math.min(node.degree || 0, 16) * 0.32;
        const depthScale = 0.78 + clamp(position.perspective, 0.52, 1.35) * 0.2;
        const activeLift = selected ? 1.06 + focusPulse * 0.025 : focused || neighbor ? 1.02 + focusPulse * 0.018 : 1;
        const radius = (base + (selected ? 5 : focused ? 3 : hovered ? 2 : 0)) * depthScale * zoomScale * (1 + zoomPulse * 0.035) * activeLift * (distant ? 0.62 : 1);
        const alpha = (0.5 + Math.max(position.depth, -1) * 0.1) * (distant ? 0.22 : 1);
        const fillAlpha = distant ? Math.max(0.06, Math.min(0.18, alpha)) : Math.max(0.3, Math.min(0.86, alpha + (neighbor ? focusPulse * 0.06 : 0)));

        if (selected || focused) drawFocusAura(position, radius, selected, pulse);

        ctx.beginPath();
        ctx.arc(position.sx, position.sy, radius + (selected ? 8 : focused ? 5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = selected ? 'rgba(255, 142, 158, ' + (0.11 + focusPulse * 0.035) + ')' : focused ? 'rgba(216, 197, 138, ' + (0.08 + focusPulse * 0.03) + ')' : distant ? 'rgba(255,255,255,0.004)' : 'rgba(255,255,255,0.018)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(position.sx, position.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(colors[node.type] || colors.dim, fillAlpha);
        ctx.fill();
        ctx.lineWidth = (selected ? 2.4 : distant ? 0.6 : 1) * Math.max(0.84, zoomScale * 0.92);
        ctx.strokeStyle = selected ? 'rgba(255, 142, 158, ' + (0.72 + focusPulse * 0.18) + ')' : distant ? 'rgba(255,255,255,0.1)' : neighbor ? 'rgba(216, 197, 138, ' + (0.32 + focusPulse * 0.16) + ')' : 'rgba(255,255,255,0.34)';
        ctx.stroke();

        if (selected || focused || hovered || neighbor) {
          drawNodeLabel(node, position, radius, selected, focused);
        }
      }

      updateFocusPopover(rect);
    }

    function linkTouchesFocus(link) {
      if (!state.focusIds.size && !state.selectedId) return false;
      return state.focusIds.has(link.source) || state.focusIds.has(link.target) || link.source === state.selectedId || link.target === state.selectedId;
    }

    function updateFocusPopover(rect) {
      const popover = document.getElementById('focus-popover');
      if (!state.selectedId) {
        popover.classList.add('hidden');
        popover.setAttribute('aria-hidden', 'true');
        return;
      }
      const position = state.positions.get(state.selectedId);
      if (!position) {
        popover.classList.add('hidden');
        popover.setAttribute('aria-hidden', 'true');
        return;
      }
      const left = clamp(position.sx, 170, rect.width - 170);
      const top = clamp(position.sy, 150, rect.height - 28);
      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
      popover.classList.remove('hidden');
      popover.setAttribute('aria-hidden', 'false');
    }

    function drawGlobeGuide(rect) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const guideRadius = Math.min(rect.width, rect.height) * 0.27 * state.zoom;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, guideRadius, 0, Math.PI * 2);
      ctx.stroke();

      drawGuideRing(function(angle) {
        return { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
      }, 'rgba(123, 200, 255, 0.07)');
      drawGuideRing(function(angle) {
        return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      }, 'rgba(243, 201, 105, 0.07)');
      drawGuideRing(function(angle) {
        return { x: 0, y: Math.cos(angle), z: Math.sin(angle) };
      }, 'rgba(255, 255, 255, 0.045)');
      ctx.restore();
    }

    function drawGuideRing(pointForAngle, color) {
      ctx.beginPath();
      for (let index = 0; index <= 96; index += 1) {
        const point = project(pointForAngle((Math.PI * 2 * index) / 96));
        if (index === 0) ctx.moveTo(point.sx, point.sy);
        else ctx.lineTo(point.sx, point.sy);
      }
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    function drawFocusAura(position, radius, selected, pulse) {
      const ring = radius + (selected ? 13 : 9) + pulse * 1.4;
      const glowAlpha = selected ? 0.1 + pulse * 0.025 : 0.075 + pulse * 0.02;
      const primaryAlpha = selected ? 0.58 + pulse * 0.12 : 0.42 + pulse * 0.1;
      const secondaryAlpha = selected ? 0.34 + pulse * 0.08 : 0.18 + pulse * 0.06;
      ctx.save();
      ctx.translate(position.sx, position.sy);
      ctx.rotate(state.orbitPhase * 0.8);

      const gradient = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, ring + 10);
      gradient.addColorStop(0, selected ? 'rgba(255, 142, 158, ' + glowAlpha + ')' : 'rgba(216, 197, 138, ' + glowAlpha + ')');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, ring + 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = selected ? 'rgba(255, 142, 158, ' + primaryAlpha + ')' : 'rgba(216, 197, 138, ' + primaryAlpha + ')';
      ctx.lineWidth = (selected ? 1.9 : 1.25) * Math.max(0.86, zoomVisualScale() * 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, ring * 1.55, ring * 0.48, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = selected ? 'rgba(123, 200, 255, ' + secondaryAlpha + ')' : 'rgba(255, 255, 255, ' + secondaryAlpha + ')';
      ctx.lineWidth = Math.max(0.85, zoomVisualScale() * 0.86);
      ctx.beginPath();
      ctx.ellipse(0, 0, ring * 0.76, ring * 1.22, Math.PI / 5, Math.PI * 0.15, Math.PI * 1.5);
      ctx.stroke();

      ctx.restore();
    }

    function drawNodeLabel(node, position, radius, selected, focused) {
      const label = node.title.slice(0, selected ? 42 : 34);
      const labelScale = clamp(Math.pow(state.zoom, 0.28), 0.9, 1.22);
      ctx.save();
      ctx.font = selected ? '700 ' + (13 * labelScale).toFixed(1) + 'px Inter, system-ui, sans-serif' : (12 * labelScale).toFixed(1) + 'px Inter, system-ui, sans-serif';
      const labelWidth = Math.min(ctx.measureText(label).width + 58, 280);
      const labelHeight = (selected ? 32 : 28) * labelScale;
      const x = position.sx - labelWidth / 2;
      const y = position.sy - radius - labelHeight - 12;
      const radiusPx = 8;

      ctx.beginPath();
      ctx.moveTo(x + radiusPx, y);
      ctx.lineTo(x + labelWidth - radiusPx, y);
      ctx.quadraticCurveTo(x + labelWidth, y, x + labelWidth, y + radiusPx);
      ctx.lineTo(x + labelWidth, y + labelHeight - radiusPx);
      ctx.quadraticCurveTo(x + labelWidth, y + labelHeight, x + labelWidth - radiusPx, y + labelHeight);
      ctx.lineTo(x + radiusPx, y + labelHeight);
      ctx.quadraticCurveTo(x, y + labelHeight, x, y + labelHeight - radiusPx);
      ctx.lineTo(x, y + radiusPx);
      ctx.quadraticCurveTo(x, y, x + radiusPx, y);
      ctx.closePath();
      ctx.fillStyle = selected ? 'rgba(18, 14, 18, 0.88)' : 'rgba(16, 17, 20, 0.76)';
      ctx.fill();
      ctx.strokeStyle = selected ? 'rgba(255, 142, 158, 0.72)' : focused ? 'rgba(243, 201, 105, 0.55)' : 'rgba(255, 255, 255, 0.28)';
      ctx.stroke();

      const chipColor = colors[node.type] || '#f7f3ea';
      ctx.fillStyle = chipColor;
      ctx.beginPath();
      ctx.arc(x + 14, y + labelHeight / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(247, 243, 234, 0.96)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 26, y + labelHeight / 2);
      ctx.restore();
    }

    function hexToRgba(hex, alpha) {
      const value = hex.replace('#', '');
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function nodeAtPoint(x, y) {
      let best = null;
      let bestDistance = Infinity;
      for (const node of state.nodes) {
        if (!visibleNode(node)) continue;
        const position = state.positions.get(node.id);
        if (!position) continue;
        const radius = (9 + Math.min(node.degree || 0, 20) * 0.35) * zoomVisualScale();
        const distance = Math.hypot(position.sx - x, position.sy - y);
        if (distance < radius && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    }

    canvas.addEventListener('pointerdown', function(event) {
      state.focusTransitionId = null;
      state.pointerDown = true;
      state.pointerMoved = false;
      state.lastPointer = { x: event.clientX, y: event.clientY, vector: arcballVector(event.clientX, event.clientY) };
    });

    function endPointerGesture() {
      state.pointerDown = false;
      state.dragging = false;
      state.lastPointer = null;
      canvas.classList.remove('dragging');
    }

    window.addEventListener('pointerup', endPointerGesture);
    window.addEventListener('pointercancel', endPointerGesture);
    window.addEventListener('blur', endPointerGesture);
    canvas.addEventListener('pointerleave', endPointerGesture);

    canvas.addEventListener('pointermove', function(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (state.pointerDown && state.lastPointer) {
        const dx = event.clientX - state.lastPointer.x;
        const dy = event.clientY - state.lastPointer.y;
        if (Math.hypot(dx, dy) > 3) {
          state.dragging = true;
          state.pointerMoved = true;
          canvas.classList.add('dragging');
        }
      }
      if (state.dragging && state.lastPointer) {
        const nextVector = arcballVector(event.clientX, event.clientY);
        rotateArcball(state.lastPointer.vector, nextVector);
        state.lastPointer = { x: event.clientX, y: event.clientY, vector: nextVector };
        return;
      }
      const node = nodeAtPoint(x, y);
      state.hoverId = node?.id || null;
    });

    canvas.addEventListener('click', function(event) {
      if (state.pointerMoved) return;
      const rect = canvas.getBoundingClientRect();
      const node = nodeAtPoint(event.clientX - rect.left, event.clientY - rect.top);
      if (node) {
        selectNode(node.id, true);
        return;
      }
      if (hasActiveFocus()) clearGraphFocus();
    });

    canvas.addEventListener('wheel', function(event) {
      event.preventDefault();
      state.focusTransitionId = null;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const zoomFactor = event.deltaMode === 0 ? 0.0075 : event.deltaMode === 1 ? 0.12 : 0.35;
        const nextZoom = state.zoomTarget * Math.exp(-event.deltaY * zoomFactor);
        state.zoomTarget = clamp(nextZoom, 0.42, 3.15);
        state.zoomPulse = Math.min(1, state.zoomPulse + Math.min(0.8, Math.abs(event.deltaY) * zoomFactor * 0.7));
        return;
      }
      const orbitScale = event.deltaMode === 0 ? 0.0028 : event.deltaMode === 1 ? 0.045 : 0.75;
      const dx = clamp(event.deltaX * orbitScale, -0.36, 0.36);
      const dy = clamp(event.deltaY * orbitScale, -0.36, 0.36);
      if (dx || dy) rotateAroundScreenAxis([-dy, -dx, 0], Math.hypot(dx, dy));
    }, { passive: false });

    document.querySelectorAll('[data-filter]').forEach(function(button) {
      button.addEventListener('click', function() {
        state.filter = button.dataset.filter;
        if (state.filter === 'all') clearGraphFocus();
        document.querySelectorAll('[data-filter]').forEach(function(item) { item.classList.remove('active'); });
        button.classList.add('active');
        setSearchStatus(state.filter === 'all' ? 'Full graph.' : 'Showing ' + state.filter + ' nodes.');
      });
    });

    document.getElementById('conversation-form').addEventListener('submit', function(event) {
      event.preventDefault();
      const input = document.getElementById('conversation-input');
      const value = input.value.trim();
      if (!value) return;
      input.value = '';
      handleUtterance(value, 'typed');
    });

    document.getElementById('selection-detail').addEventListener('click', function(event) {
      if (event.target.closest('[data-clear-focus]')) clearGraphFocus();
    });

    window.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && hasActiveFocus()) clearGraphFocus();
    });

    function handleUtterance(text, source) {
      const response = interpretGraphRequest(text);
      setSearchStatus(response.text);
    }

    function setSearchStatus(text) {
      const status = document.getElementById('search-status');
      if (status) status.textContent = text;
    }

    function interpretGraphRequest(text) {
      const lower = text.toLowerCase();
      if (/\\b(all|everything|reset|full graph)\\b/.test(lower) || lower.includes('전체')) {
        state.filter = 'all';
        clearGraphFocus();
        syncFilterButtons();
        return { text: 'Resetting to the full graph. The whole Slice corpus is visible again.', speak: true };
      }
      if (lower.includes('only slices') || lower.includes('show slices') || lower.includes('slice만')) {
        state.filter = 'slice';
        clearGraphFocus();
        syncFilterButtons();
        return { text: 'Showing slice records. I kept selected neighbors visible when you focus a topic.', speak: true };
      }
      if (lower.includes('only entities') || lower.includes('show entities') || lower.includes('entity만') || lower.includes('엔티티')) {
        state.filter = 'entity';
        clearGraphFocus();
        syncFilterButtons();
        return { text: 'Showing entity nodes. These are the stable referents that connect slices over time.', speak: true };
      }
      if (lower.includes('only stories') || lower.includes('show stories') || lower.includes('story만') || lower.includes('스토리')) {
        state.filter = 'story';
        clearGraphFocus();
        syncFilterButtons();
        return { text: 'Showing story views. These are collected surfaces over source slices.', speak: true };
      }

      const query = cleanQuery(text);
      const matches = searchNodes(query).slice(0, 9);
      if (!matches.length) {
        clearGraphFocus();
        return { text: 'I could not find a strong graph match for "' + text + '". Try a project, person, story, or entity name.', speak: true };
      }

      state.focusIds = new Set(matches.map(function(node) { return node.id; }));
      selectNode(matches[0].id, false);
      const selected = matches[0];
      const connected = connectedNodes(selected.id).slice(0, 4);
      const connectedText = connected.length ? ' Connected context: ' + connected.map(function(node) { return node.title; }).join(', ') + '.' : '';
      const evidence = selected.type + (selected.at ? ' from ' + selected.at : '') + (selected.path ? ' at ' + selected.path : '');
      return {
        text: 'Focusing ' + selected.title + '. It is a ' + evidence + ' with ' + (selected.degree || 0) + ' graph connection(s).' + connectedText,
        speak: true
      };
    }

    function cleanQuery(text) {
      return text
        .toLowerCase()
        .replace(/\\b(show|open|focus|find|what|why|how|is|are|the|me|about|cluster|connected|to|with|please|좀|보여줘|열어|찾아|왜|뭐|연결|관련)\\b/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim() || text.toLowerCase();
    }

    function searchNodes(query) {
      const terms = query.split(/\\s+/).filter(Boolean);
      return state.nodes.map(function(node) {
        const haystack = node.searchText || '';
        const score = terms.reduce(function(total, term) {
          if (!term) return total;
          if ((node.title || '').toLowerCase().includes(term)) return total + 4;
          if (haystack.includes(term)) return total + 1;
          return total;
        }, 0) + Math.min(node.degree || 0, 10) * 0.05;
        return { node, score };
      }).filter(function(item) {
        return item.score > 0;
      }).sort(function(left, right) {
        return right.score - left.score;
      }).map(function(item) {
        return item.node;
      });
    }

    function selectNode(id, announce) {
      if (announce && state.selectedId === id) {
        clearGraphFocus();
        return;
      }
      state.selectedId = id;
      state.focusTransitionId = id;
      if (announce) state.focusIds.clear();
      state.focusIds.add(id);
      const node = state.nodes.find(function(item) { return item.id === id; });
      renderSelection(node);
      if (announce && node) {
        setSearchStatus('Selected ' + node.title + '.');
      }
    }

    function clearGraphFocus() {
      state.selectedId = null;
      state.focusTransitionId = null;
      state.focusIds.clear();
      renderSelection(null);
    }

    function renderSelection(node) {
      const root = document.getElementById('selection-detail');
      if (!node) {
        renderFocusPopover(null);
        root.innerHTML = '<h2>No node selected</h2><p>Click a graph node or search for a topic.</p>';
        return;
      }
      const connected = connectedNodes(node.id).slice(0, 7);
      const meta = [
        node.type,
        node.at,
        node.entityId,
        node.path,
        (node.degree || 0) + ' links'
      ].filter(Boolean);
      const description = nodeDescription(node);
      renderFocusPopover(node, connected);
      root.innerHTML =
        '<div class="selection-head">' +
        '<h2>' + escapeHtml(node.title) + '</h2>' +
        '<button class="clear-focus-button" data-clear-focus type="button">Clear</button>' +
        '</div>' +
        '<div class="meta-row">' + meta.map(function(item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('') + '</div>' +
        '<p>' + escapeHtml(description) + '</p>' +
        (connected.length ? '<ul class="connected-list">' + connected.map(function(item) {
          return '<li>' + escapeHtml(item.title) + ' <span>(' + escapeHtml(item.type) + ')</span></li>';
        }).join('') + '</ul>' : '');
    }

    function renderFocusPopover(node, connected) {
      const popover = document.getElementById('focus-popover');
      if (!node) {
        popover.innerHTML = '';
        popover.classList.add('hidden');
        popover.setAttribute('aria-hidden', 'true');
        return;
      }
      const meta = [node.type, node.at || node.entityId, (node.degree || 0) + ' links'].filter(Boolean);
      popover.innerHTML =
        '<h3>' + escapeHtml(node.title) + '</h3>' +
        '<p>' + escapeHtml(nodeDescription(node)) + '</p>' +
        '<div class="meta-row">' + meta.slice(0, 3).map(function(item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('') + '</div>';
    }

    function nodeDescription(node) {
      if (node.excerpt && !/^Entity (from registry|inferred from note text)\\.$/.test(node.excerpt)) return node.excerpt;
      if (node.type === 'entity') {
        const aliases = (node.aliases || []).filter(function(alias) { return alias && alias !== node.title; });
        if (aliases.length) return 'Aliases: ' + aliases.slice(0, 8).join(', ');
        return 'Entity node connected to ' + (node.degree || 0) + ' slice/story context(s).';
      }
      if (node.content) return node.content.split(/\\n\\n+/)[0].slice(0, 260);
      return 'No description available.';
    }

    function connectedNodes(id) {
      const neighborIds = new Set();
      state.links.forEach(function(link) {
        if (link.source === id) neighborIds.add(link.target);
        if (link.target === id) neighborIds.add(link.source);
      });
      return [...neighborIds].map(function(nodeId) {
        return state.nodes.find(function(node) { return node.id === nodeId; });
      }).filter(Boolean).sort(function(left, right) {
        return (right.degree || 0) - (left.degree || 0);
      });
    }

    function syncFilterButtons() {
      document.querySelectorAll('[data-filter]').forEach(function(button) {
        button.classList.toggle('active', button.dataset.filter === state.filter);
      });
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    window.addEventListener('resize', resize);
    boot().catch(function(error) {
      setSearchStatus(error.message);
      console.error(error);
    });
  `;
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
  const kebabSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';
  const dirPath = path.join(repo, config.paths.slices, year, month);
  const filePath = path.join(dirPath, `slice-${date}-${kebabSubject}.md`);
  const relativeSlicePath = path.relative(repo, filePath);
  const entityIds = syncSliceEntities(repo, config, { subject, content, at, slicePath: relativeSlicePath });
  const frontmatter = [
    '---',
    `at: ${yamlScalar(at)}`,
    `open: ${isOpen}`,
    `subject: ${yamlScalar(subject)}`
  ];
  if (entityIds.length) {
    frontmatter.push('entities:');
    for (const id of entityIds) frontmatter.push(`  - ${yamlScalar(id)}`);
  }
  frontmatter.push('---');
  const fileContent = `${frontmatter.join('\n')}\n\n# ${subject}\n\n${content}\n`;
  ensureDir(dirPath);
  fs.writeFileSync(filePath, fileContent);
  console.log(`Successfully captured slice: ${path.relative(repo, filePath)}`);
  if (entityIds.length) console.log(`Entities: ${entityIds.join(', ')}`);
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
  const registry = readEntityRegistry(path.join(repo, config.paths.entitiesRegistry));
  const entityIds = new Set();
  for (const entry of registry) {
    if (!entry.id) {
      issues.push({ level: 'error', path: config.paths.entitiesRegistry, message: 'entity entry is missing id' });
      continue;
    }
    if (entityIds.has(entry.id)) issues.push({ level: 'error', path: config.paths.entitiesRegistry, message: `duplicate entity id: ${entry.id}` });
    entityIds.add(entry.id);
  }
  for (const note of readMarkdownTree(path.join(repo, config.paths.slices), 'slices')) {
    const filename = path.basename(note.filePath);
    if (!/^slice-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(filename)) {
      issues.push({ level: 'warn', path: path.relative(repo, note.filePath), message: 'slice filename should be slice-YYYY-MM-DD-kebab-case.md' });
    }
    if (!note.frontmatter.at) issues.push({ level: 'error', path: path.relative(repo, note.filePath), message: 'missing required frontmatter: at' });
    for (const entityId of parseList(note.frontmatter.entities)) {
      if (!entityIds.has(entityId)) {
        issues.push({ level: 'warn', path: path.relative(repo, note.filePath), message: `frontmatter references unknown entity: ${entityId}` });
      }
    }
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
    if (entry.isDirectory()) {
      if (WALK_IGNORED_DIRS.has(entry.name)) return [];
      return walk(fullPath);
    }
    return [fullPath];
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
      frontmatter[currentListKey].push(parseYamlScalar(listMatch[1].trim()));
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

    frontmatter[key] = parseYamlScalar(value);
    currentListKey = null;
  }
  return { frontmatter, body: raw.slice(end + 5) };
}

function parseYamlScalar(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
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
  return readEntityRegistry(filePath);
}

function readEntityRegistry(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'entities: []') return [];

  const entries = [];
  let current = null;
  let currentListKey = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || /^\s*entities\s*:/.test(line)) continue;

    const entryMatch = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (entryMatch) {
      current = { id: parseYamlScalar(entryMatch[1]) };
      entries.push(current);
      currentListKey = null;
      continue;
    }

    if (!current) continue;

    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentListKey) {
      current[currentListKey].push(parseYamlScalar(listMatch[1]));
      continue;
    }

    const fieldMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_-]*):(?:\s*(.*))?$/);
    if (!fieldMatch) continue;

    const [, key, rawValue = ''] = fieldMatch;
    const value = rawValue.trim();
    if (!value) {
      current[key] = [];
      currentListKey = key;
      continue;
    }
    current[key] = parseYamlScalar(value);
    currentListKey = null;
  }

  if (entries.length) return entries.filter(entry => entry.id);

  return parseLegacyEntityRegistry(raw);
}

function parseLegacyEntityRegistry(raw) {
  const entries = [];
  let current = null;
  let currentListKey = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const topLevel = line.match(/^([a-z0-9][a-z0-9-]*):\s*$/);
    if (topLevel) {
      current = { id: topLevel[1], label: labelFromEntityId(topLevel[1]), aliases: [], slices: [] };
      entries.push(current);
      currentListKey = null;
      continue;
    }

    if (!current) continue;

    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentListKey) {
      current[currentListKey].push(parseYamlScalar(listMatch[1]));
      continue;
    }

    const fieldMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_-]*):(?:\s*(.*))?$/);
    if (!fieldMatch) continue;

    const [, key, rawValue = ''] = fieldMatch;
    const value = rawValue.trim();
    if (!value) {
      current[key] = [];
      currentListKey = key;
      continue;
    }
    current[key] = parseYamlValue(value);
    currentListKey = null;
  }
  return entries.filter(entry => entry.id);
}

function parseYamlValue(value) {
  const text = String(value || '').trim();
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1)
      .split(',')
      .map(item => parseYamlScalar(item.trim()))
      .filter(Boolean);
  }
  return parseYamlScalar(text);
}

function writeEntityRegistry(filePath, entries) {
  ensureDir(path.dirname(filePath));
  if (!entries.length) {
    fs.writeFileSync(filePath, 'entities: []\n');
    return;
  }

  const knownKeys = new Set(['id', 'label', 'aliases', 'first_seen', 'last_seen', 'slices']);
  const lines = ['entities:'];
  for (const entry of entries) {
    lines.push(`  - id: ${yamlScalar(entry.id)}`);
    lines.push(`    label: ${yamlScalar(entry.label || labelFromEntityId(entry.id))}`);
    writeYamlList(lines, 'aliases', uniqueStrings(entry.aliases || []), 4);
    if (entry.first_seen) lines.push(`    first_seen: ${yamlScalar(entry.first_seen)}`);
    if (entry.last_seen) lines.push(`    last_seen: ${yamlScalar(entry.last_seen)}`);
    writeYamlList(lines, 'slices', uniqueStrings(entry.slices || []), 4);
    for (const key of Object.keys(entry).filter(key => !knownKeys.has(key)).sort()) {
      const value = entry[key];
      if (Array.isArray(value)) {
        writeYamlList(lines, key, uniqueStrings(value), 4);
      } else if (value !== undefined && value !== null && value !== '') {
        lines.push(`    ${key}: ${yamlScalar(value)}`);
      }
    }
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

function writeYamlList(lines, key, values, indent) {
  if (!values.length) return;
  const space = ' '.repeat(indent);
  lines.push(`${space}${key}:`);
  for (const value of values) lines.push(`${space}  - ${yamlScalar(value)}`);
}

function syncSliceEntities(repo, config, slice) {
  const registryPath = path.join(repo, config.paths.entitiesRegistry);
  const registry = readEntityRegistry(registryPath);
  const seeds = extractEntitySeeds(slice.subject, slice.content);
  const entityIds = [];
  let changed = false;

  for (const seed of seeds) {
    const normalized = normalizeEntitySeed(seed);
    if (!normalized) continue;

    const resolved = resolveExistingEntity(registry, normalized);
    const entry = resolved?.entry || {
      id: normalized.id,
      label: normalized.label,
      aliases: [],
      slices: []
    };
    if (!resolved) {
      registry.push(entry);
      changed = true;
    }

    if (mergeEntityUsage(entry, normalized, slice)) changed = true;
    entityIds.push(entry.id);
  }

  if (changed) writeEntityRegistry(registryPath, registry);
  return uniqueStrings(entityIds);
}

function extractEntitySeeds(subject, content) {
  const seeds = [{ label: subject, source: 'slice-subject' }];
  const text = `${subject}\n${content}`;

  for (const match of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const idPart = match[1].trim();
    const label = (match[2] || labelFromEntityId(idPart)).trim();
    seeds.push({ label, idHint: normalizeEntityId(idPart), aliases: [idPart, label], source: 'wikilink' });
  }

  for (const match of text.matchAll(/`([^`\n]{2,80})`/g)) {
    const label = match[1].trim();
    if (!looksLikeEntityCode(label)) continue;
    seeds.push({ label, source: 'inline-code' });
  }

  for (const line of content.split(/\r?\n/)) {
    for (const seed of extractSentenceEntitySeeds(line)) seeds.push(seed);
  }

  return dedupeSeeds(seeds);
}

function extractSentenceEntitySeeds(line) {
  const sentence = line
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。]+$/, '');
  if (!sentence) return [];

  const predicate = '(?:is|are|was|were|has|have|uses|used|supports|prefers|preferred|asked|questioned|proposed|suggested|wants|wanted|needs|needed|captures|captured|creates|created|stores|stored|links|linked|syncs|synced|treats|treated)';
  const match = sentence.match(new RegExp(`^(?:the\\s+)?(.+?)\\s+${predicate}\\s+(.+)$`, 'i'));
  if (!match) return [];

  const seeds = [];
  const subject = cleanEntityLabel(match[1]);
  const object = cleanEntityLabel(match[2].split(/\s+(?:because|when|while|if|unless|so|but|and then)\s+/i)[0]);
  if (isGoodEntityLabel(subject)) seeds.push({ label: subject, source: 'sentence-subject' });
  if (isGoodEntityLabel(object)) seeds.push({ label: object, source: 'sentence-object' });
  return seeds;
}

function normalizeEntitySeed(seed) {
  const label = cleanEntityLabel(seed.label);
  if (!isGoodEntityLabel(label)) return null;
  const aliases = uniqueStrings([...(seed.aliases || []), label].map(cleanEntityLabel).filter(isGoodEntityLabel));
  const id = seed.idHint || normalizeEntityId(label);
  if (!id) return null;
  return { ...seed, id, label, aliases };
}

function resolveExistingEntity(entries, seed) {
  const seedForms = uniqueStrings([seed.idHint, seed.id, seed.label, ...(seed.aliases || [])].filter(Boolean).map(normalizeEntityId));
  for (const entry of entries) {
    const entryForms = entityForms(entry);
    if (seedForms.some(form => entryForms.includes(form))) return { entry, reason: 'exact' };
  }

  let best = null;
  for (const entry of entries) {
    for (const seedForm of seedForms) {
      for (const entryForm of entityForms(entry)) {
        const score = entitySimilarity(seedForm, entryForm);
        if (!best || score > best.score) best = { entry, reason: 'similar', score };
      }
    }
  }
  return best && best.score >= 0.94 ? best : null;
}

function mergeEntityUsage(entry, seed, slice) {
  let changed = false;
  const aliases = uniqueStrings([...(entry.aliases || []), ...seed.aliases].filter(alias => normalizeEntityId(alias) !== entry.id));
  if (aliases.join('\n') !== (entry.aliases || []).join('\n')) {
    entry.aliases = aliases;
    changed = true;
  }
  if (!entry.label) {
    entry.label = seed.label;
    changed = true;
  }
  const seen = dateFromAt(slice.at);
  if (seen && !entry.first_seen) {
    entry.first_seen = seen;
    changed = true;
  }
  if (seen && entry.last_seen !== seen) {
    entry.last_seen = seen;
    changed = true;
  }
  const slices = uniqueStrings([...(entry.slices || []), slice.slicePath]);
  if (slices.join('\n') !== (entry.slices || []).join('\n')) {
    entry.slices = slices;
    changed = true;
  }
  return changed;
}

function entityForms(entry) {
  return uniqueStrings([entry.id, entry.label, ...(entry.aliases || [])].filter(Boolean).map(normalizeEntityId));
}

function entitySimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (singularEntityId(left) === singularEntityId(right)) return 0.97;
  const leftTokens = left.split('-').filter(Boolean);
  const rightTokens = right.split('-').filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const intersection = leftTokens.filter(token => rightTokens.includes(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function singularEntityId(id) {
  return id.split('-').map(part => part.endsWith('s') ? part.slice(0, -1) : part).join('-');
}

function cleanEntityLabel(value) {
  return String(value || '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => label || id)
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/[`*_#>]/g, '')
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/^(?:the|a|an|this|that|these|those|my|our)\s+/i, '')
    .replace(/\s+(?:as|inside|into|from|with|for|about|rather than|instead of)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGoodEntityLabel(label) {
  const text = String(label || '').trim();
  if (!text || text.length < 2 || text.length > 80) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  const normalized = normalizeEntityId(text);
  if (!normalized || ENTITY_STOPWORDS.has(normalized)) return false;
  if (/^(?:whether|that|how|why|when|where|to|using|being)\b/i.test(text)) return false;
  return true;
}

function looksLikeEntityCode(label) {
  if (/^[-\w]+$/.test(label)) return true;
  if (/^[.@]?[-\w/]+(\.[-\w]+)?$/.test(label)) return true;
  return false;
}

function dedupeSeeds(seeds) {
  const seen = new Set();
  const result = [];
  for (const seed of seeds) {
    const normalized = normalizeEntitySeed(seed);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    result.push(seed);
  }
  return result;
}

function normalizeEntityId(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function labelFromEntityId(id) {
  return String(id || '').split('-').filter(Boolean).join(' ');
}

function dateFromAt(value) {
  return String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function syncMcpConnectors(repo, config) {
  const pluginsRoot = path.join(repo, config.paths.plugins);
  const installedConnectors = findInstalledConnectors(pluginsRoot);
  const examples = findMcpExamples(pluginsRoot);
  const result = { servers: [], written: [], skipped: [] };
  if (!installedConnectors.length && !examples.length) return result;

  const mcpServers = {};
  const geminiPolicies = {};
  const codexServers = [];
  for (const installed of installedConnectors) {
    const manifestResult = readConnectorManifest(installed.connector, installed.pluginDir);
    if (manifestResult.error) {
      result.skipped.push({ path: installed.pluginRelativePath, reason: manifestResult.error });
      continue;
    }

    const manifest = manifestResult.manifest;
    const pluginDir = installed.pluginDir;
    const serverName = manifest.serverName || manifest.id;
    const serverConfig = connectorRuntimeToMcpServer(manifest, repo, pluginDir);
    if (!serverName || !serverConfig.command) {
      result.skipped.push({ path: installed.pluginRelativePath, reason: 'missing serverName or runtime.command' });
      continue;
    }
    mcpServers[serverName] = serverConfig;
    geminiPolicies[serverName] = manifest.policies?.gemini || {};
    codexServers.push({ name: serverName, manifest, config: serverConfig });
    result.servers.push({ name: serverName, plugin: path.relative(repo, pluginDir) });
  }

  for (const examplePath of examples) {
    const pluginDir = path.dirname(examplePath);
    if (fs.existsSync(path.join(pluginDir, 'connector.json'))) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
    } catch (error) {
      result.skipped.push({ path: path.relative(repo, examplePath), reason: `invalid JSON: ${error.message}` });
      continue;
    }
    const plugin = readPluginManifest(pluginDir);
    for (const [serverName, serverConfig] of Object.entries(parsed.mcpServers || {})) {
      const resolved = resolveMcpPlaceholders(serverConfig, repo);
      if (!resolved.command || String(resolved.command).startsWith('/path/to/')) {
        result.skipped.push({ path: path.relative(repo, examplePath), reason: `could not resolve command for ${serverName}` });
        continue;
      }
      mcpServers[serverName] = resolved;
      geminiPolicies[serverName] = {};
      codexServers.push({ name: serverName, plugin, config: resolved });
      result.servers.push({ name: serverName, plugin: path.relative(repo, pluginDir) });
    }
  }

  if (!Object.keys(mcpServers).length) return result;

  result.written.push(writeProjectMcpConfig(repo, mcpServers));
  result.written.push(writeGeminiMcpConfig(repo, mcpServers, geminiPolicies));
  try {
    const codexPath = maybeWriteCodexMcpConfig(codexServers);
    if (codexPath) result.written.push(codexPath);
  } catch (error) {
    result.skipped.push({ path: path.join(os.homedir(), '.codex', 'config.toml'), reason: error.message });
  }
  return result;
}

function findInstalledConnectors(pluginsRoot) {
  if (!fs.existsSync(pluginsRoot)) return [];
  return readConnectorRegistry()
    .map(connector => {
      const pluginDir = path.join(path.dirname(pluginsRoot), '..', connector.pluginPath);
      return {
        connector,
        pluginDir: path.normalize(pluginDir),
        pluginRelativePath: connector.pluginPath
      };
    })
    .filter(installed => fs.existsSync(installed.pluginDir));
}

function readConnectorManifest(connector, pluginDir) {
  const defaultManifestPath = path.join(connector.dir, 'connector.json');
  if (!fs.existsSync(defaultManifestPath)) return { error: `missing runtime manifest: ${path.relative(PACKAGE_ROOT, defaultManifestPath)}` };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(defaultManifestPath, 'utf-8'));
  } catch (error) {
    return { error: `invalid runtime manifest: ${error.message}` };
  }
  const overridePath = path.join(pluginDir, 'connector.json');
  if (fs.existsSync(overridePath)) {
    try {
      manifest = deepMerge(manifest, JSON.parse(fs.readFileSync(overridePath, 'utf-8')));
    } catch (error) {
      return { error: `invalid local connector override: ${error.message}` };
    }
  }
  return { manifest };
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (!base || typeof base !== 'object' || !override || typeof override !== 'object') return override ?? base;
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  }
  return merged;
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

function connectorRuntimeToMcpServer(manifest, repo, pluginDir) {
  const runtime = manifest.runtime || {};
  return {
    type: manifest.transport || 'stdio',
    command: resolveCommand(runtime.command || ''),
    args: resolveConnectorRuntimeValue(runtime.args || [], repo, pluginDir),
    env: resolveConnectorRuntimeValue(runtime.env || {}, repo, pluginDir)
  };
}

function resolveCommand(command) {
  if (!command) return '';
  if (path.isAbsolute(command)) return command;
  return findExecutable(command) || command;
}

function resolveConnectorRuntimeValue(value, repo, pluginDir) {
  if (Array.isArray(value)) return value.map(item => resolveConnectorRuntimeValue(item, repo, pluginDir));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveConnectorRuntimeValue(item, repo, pluginDir)])
    );
  }
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('${repo}', repo)
    .replaceAll('${pluginDir}', pluginDir)
    .replaceAll('${uv}', findExecutable('uv') || 'uv');
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

function writeGeminiMcpConfig(repo, servers, policies = {}) {
  const filePath = path.join(repo, '.gemini', 'settings.json');
  const current = readJsonFile(filePath, { mcpServers: {} });
  current.mcpServers = current.mcpServers || {};
  for (const [name, server] of Object.entries(servers)) {
    const { type, ...geminiServer } = server;
    const policy = policies[name] || {};
    current.mcpServers[name] = {
      timeout: 30000,
      trust: false,
      ...(current.mcpServers[name] || {}),
      ...geminiServer,
      ...policy
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
  const approvalMode = server.manifest?.policies?.codex?.approvalMode || 'approve';
  const tools = server.manifest?.tools || server.plugin?.frontmatter?.tools || [];
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
  for (const tool of tools) {
    lines.push(`[mcp_servers.${server.name}.tools.${tool}]`);
    lines.push(`approval_mode = "${tomlString(approvalMode)}"`);
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

function stringArg(args, flag, fallback) {
  const idx = args.indexOf(flag);
  return idx === -1 ? fallback : String(args[idx + 1] || fallback);
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

- **Slices**: Source memory; one subject in one context, written as structured narrative sentences. Stored in \`slices/YYYY/MM/\`.
- **Entities**: Stable subjects and objects surfaced from slice sentences and \`[[wikilinks]]\`.
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
3. **Capture**: When new durable facts or thoughts should be written, describe the slice as concise sentences, then run \`slice slice capture "<subject>" "<at>" "<content>"\`.
4. **Slice Writing**: Prefer bullet sentences. Each sentence should state one claim, event, request, decision, concern, or open question. Use a clear subject, predicate, and object when natural. Mark stable referents with \`[[canonical-id]]\` when known.
5. **Entities**: Let \`slice slice capture\` maintain \`entities/registry.yaml\` mechanically. It resolves canonical IDs, writes slice frontmatter \`entities\`, and records which slices mention each entity. Use \`slice entities show <entity>\` when a possible match needs context.
6. **Collect**: Keep \`stories/\` as collected views over source slices. Stories are not mandatory plugin output; they can be manually maintained long-running surfaces.
7. **Plugin Lifecycle**: At lifecycle points, run \`slice lifecycle run <event>\` and apply relevant \`.slice/plugins/*/PLUGIN.md\` instructions.
8. **Connector Setup**: When the user asks to connect Gmail, Google Calendar, or another supported connector, handle discovery, install, MCP config sync, and verification through Slice commands internally. Do not ask the user to edit MCP config files or run connector commands manually. \`slice context <agent>\` repairs installed connector MCP config automatically.
9. **Extension Setup**: Put connector, tool, script, MCP, and view-specific behavior inside plugin folders instead of adding new top-level runtime directories.
10. **Validation**: Run \`slice validate\` after any memory file write.
11. **Closure**: Follow the slice boundary rule: same subject plus same context stays in the same slice; otherwise create a new slice.

## Operating Loop

1. Start with \`slice briefing\`.
2. Retrieve only the memory needed for the current turn.
3. Answer or act using live context first and retrieved memory second.
4. Capture durable source memory as a slice when appropriate.
5. Let capture-time entity sync update the registry; inspect entity context only when a canonical match is ambiguous.
6. Run lifecycle plugins when the turn reaches \`session_start\`, \`after_capture\`, \`after_turn\`, or another configured event.
7. Validate after writes.

## Toolset

- **Briefing**: \`slice briefing\`
- **Search**: \`slice retrieve search <query>\`
- **Recent**: \`slice retrieve recent [N]\`
- **Capture**: \`slice slice capture "<subject>" "<at>" "<content>"\`
- **Entities**: \`slice entities list\`, \`slice entities show <entity>\`
- **Lifecycle**: \`slice lifecycle run <event>\`
- **Connectors**: \`slice connectors list\`, \`slice connectors show <connector>\`, \`slice connectors install <connector>\`, \`slice connectors sync\`
- **Validate**: \`slice validate\`

Connector commands are agent/internal tools. In user-facing conversation, ask only for the external action that cannot be automated, such as selecting a Google account in OAuth or restarting the MCP client after config changes.

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
slice entities list
slice entities show <entity>
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

Write a slice as structured narrative sentences, not as a raw transcript. Prefer bullet sentences. Each sentence should state one claim, event, request, decision, concern, or open question. Use a clear subject, predicate, and object when natural.

Before writing:

1. Decide whether the turn continues a current-session subject, starts a new subject, or should stay uncaptured.
2. Ask before writing sensitive durable material, venting, stable identity changes, or inferred material beyond what the user grounded.
3. Mark known stable referents with \`[[canonical-id]]\` when that improves entity resolution.

\`slice slice capture\` mechanically extracts entity seeds from the slice subject, \`[[wikilinks]]\`, inline code terms, and simple sentence subjects/objects. It writes canonical entity IDs into slice frontmatter and updates \`entities/registry.yaml\`. Use \`slice entities show <entity>\` to inspect prior usage when a match is ambiguous.

After writing:

\`\`\`bash
slice validate
slice lifecycle run after_capture
\`\`\`

## Stories

Stories are flexible views, not source memory. Create or update stories only when useful as a view over slices.

## Plugins

Plugins are folders under \`.slice/plugins\`. Each plugin owns a \`PLUGIN.md\` with frontmatter triggers and instruction body. Optional plugin-local files may include \`tools/\`, scripts, local overrides, templates, or generated scratch paths. Run \`slice lifecycle run <event>\` to discover relevant plugins, then apply each plugin's When/Do/Output sections if relevant.
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
