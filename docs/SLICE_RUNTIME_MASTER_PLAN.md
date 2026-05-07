# Slice Master Plan

## Identity

Slice is an AI-powered thinking partner built on durable life capture.

The core system captures what is in the user's head and life, stores it as
slices, extracts entities, and uses the stored context when answering.

The product center is:

```text
conversation and life sources
  -> slices
  -> entities
  -> retrieval
  -> grounded thinking with the user
```

Plugins are ways to use this captured information. The core product provides the
runtime, events, triggers, storage, retrieval, and capability surface that let
plugins work.

The plugin behavior itself can be external or repo-local. The plugin hosting
environment is Slice's responsibility.

## Core Premise

The user naturally talks with an AI partner.

Slice captures durable pieces of the user's thinking and life:

- ideas
- decisions
- concerns
- memories
- preferences
- commitments
- projects
- relationships
- recurring questions
- facts from external sources

External sources can include email, calendar, documents, code repositories,
notes, messages, browser context, and future connectors.

The captured material becomes a durable personal corpus. Slice then extracts
entities from that corpus and uses the stored context to answer, reason, and
connect new thoughts to prior life context.

## Solid Core

The solid system is the capture and use loop:

```text
Input
  conversation
  external source retrieval
  imported notes or documents

Capture
  select durable material
  write structured slice records

Entity Extraction
  identify stable referents
  resolve canonical ids
  maintain entity usage history

Retrieval
  search slices and entities
  assemble relevant context

Answering
  use retrieved context
  cite or surface stored memory when needed
  preserve continuity across sessions
```

This loop is the product foundation. Every other feature sits on top of it.

The solid core also includes the extension substrate:

```text
Plugin Runtime
  load plugin manifests
  expose stable lifecycle events
  provide hook execution
  enforce plugin permissions
  pass slices, entities, and retrieval context to plugins
  record plugin effects
```

The core corpus makes Slice useful. The plugin runtime makes Slice extensible.

## Product Promise

Slice gives the user a partner that:

- listens to natural conversation
- captures durable mental and life context
- preserves the user's evolving personal corpus
- recognizes stable entities across time
- retrieves relevant stored context while answering
- connects new thoughts to old context
- brings in additional life sources through connectors
- supports plugins that use the stored corpus in focused ways

## Conceptual Layers

### Partner Layer

The partner layer is the conversational intelligence.

It understands the user's words, performs semantic distillation, decides which
material is durable, asks for clarification when a premise is missing, and uses
stored context while thinking with the user.

### Slice Layer

The slice layer is the durable source-memory layer.

A slice represents one coherent moment, idea, decision, concern, question,
source item, or life fact in context.

Slice bodies use structured narrative sentences:

```md
- [[user]] reframed [[slice]] as an [[ai-thinking-partner]].
- [[slice-capture]] stores [[user-life-context]].
- [[entity-extraction]] maps [[slice-records]] into [[stable-referents]].
```

The sentence structure is a writing discipline. The slice remains the durable
memory unit.

### Entity Layer

The entity layer gives the corpus stable referents.

Entities include people, projects, organizations, places, tools, codebases,
concepts, commitments, source systems, and recurring tensions.

Entity resolution flow:

```text
slice text
  -> entity seeds
  -> canonical match search
  -> usage context inspection
  -> canonical id reuse or new entity creation
  -> registry update
```

Clear matches proceed mechanically. Ambiguous matches become explicit questions
or unresolved candidates.

### Retrieval Layer

The retrieval layer turns stored context into usable thinking context.

It searches slices, entities, source metadata, and generated indexes. It returns
the context the partner needs to answer from the user's actual corpus.

### Plugin Layer

The plugin layer uses captured information for focused behaviors.

Examples:

```text
todo
  Uses slices and entities to maintain open loops and waiting items.

identity
  Uses explicit identity-level slices to maintain stable self-model context.

google-workspace
  Retrieves Gmail and Calendar context as additional life sources.

project
  Uses repo and slice context to maintain project state views.
```

Plugins consume the corpus and add behaviors. The core system provides the
runtime, triggers, permissions, and data access they need.

Slice owns the plugin environment:

- plugin discovery
- manifest schema
- lifecycle event vocabulary
- hook runner
- permission model
- input/output contract
- execution logs
- validation around plugin writes

## Normal Experience

The normal user experience is conversation.

```text
User:
  I think Slice should capture everything important from my head and life,
  extract entities, and use that when answering.

Slice:
  understands the product correction
  updates the active design direction
  captures the durable framing as a slice
  updates relevant entities
  uses the stored framing in later answers
```

Commands exist for manual operation, debugging, scripting, and tests. The
everyday product experience is driven by conversation and source connection.

## Data Model

```text
slices/
  Durable source-memory records.

entities/registry.yaml
  Canonical entity store and usage history.

stories/
  Readable views built from slices and entities.
  Plugins may own specific stories.

.slice/
  System area for config, plugins, indexes, events, and runtime state.
```

## `.slice/`

`.slice/` is the system area that lets the partner and plugins operate inside a
repo.

```text
.slice/
  config.json
    Slice-enabled repo declaration.
    Schema version, paths, runtime compatibility, enabled capabilities.

  plugins/
    Installed capabilities that use the captured corpus.

  runtime/
    Locks, temporary transactions, local execution metadata.

  index/
    Generated search, retrieval, and entity indexes.

  events/
    Audit trail for capture, retrieval, entity, and plugin activity.
```

Tracked state:

```text
.slice/config.json
.slice/plugins/**
```

Rebuildable or local state:

```text
.slice/runtime/**
.slice/index/**
```

## Plugin Architecture

Plugins are structured ways to use captured information.

The user anchors plugins into Slice through `.slice/plugins/`. Slice provides
the runner that discovers, validates, and executes those plugins.

Target plugin shape:

```text
.slice/plugins/<plugin-id>/
  plugin.json
    machine-readable capability manifest

  PLUGIN.md
    human-readable behavior policy

  hooks/
    event-triggered executable behavior

  views/
    plugin-owned readable surfaces

  tools/
    local helpers, scripts, or MCP servers
```

Plugin events describe useful moments in the core loop:

```text
partner_start
  The partner enters a Slice-enabled repo or workspace.

source_connected
  A source such as Gmail, Calendar, documents, or repo context becomes available.

context_needed
  The partner needs stored memory or external source context.

slice_captured
  Durable material has been written as a slice.

entities_updated
  Entity extraction or canonicalization changed the registry.

answer_prepared
  Retrieved context has been assembled for a response.

turn_end
  A conversation turn has completed.
```

Plugins subscribe to these events to update views, retrieve source context, or
run focused workflows.

Plugin execution contract:

```text
event occurs
  -> Slice loads matching plugin manifests
  -> Slice checks permissions and hook availability
  -> Slice passes a typed event payload
  -> plugin hook runs in the Slice runner
  -> hook returns structured effects
  -> Slice applies allowed effects
  -> Slice records the result
```

## Agent Integration

A Slice-enabled repo activates the thinking partner inside an AI agent.

Setup provides:

```text
bootstrap files
  host-specific instructions for Codex, Claude Code, Gemini, and other agents

runtime tools
  MCP tools for agent-native capability calls
  CLI for manual operation and tests

repo capabilities
  installed plugins, connectors, generated indexes, and readable views
```

Desired flow:

```text
agent opens Slice-enabled repo
  -> agent loads bootstrap
  -> agent connects to Slice capabilities
  -> user speaks naturally
  -> partner captures and retrieves personal context
  -> plugins use the corpus for focused behaviors
```

## AI Boundary

The AI partner performs semantic work.

It decides what matters, how to summarize a messy thought, which entities are
conceptually important, how source material relates to the user's life, and when
a question should stay open.

System code owns durable state changes:

```text
AI partner
  interprets meaning
  creates structured memory intent
  identifies entity seeds
  chooses when the user should clarify

System code
  validates data shape
  resolves canonical entities
  writes files
  executes plugin hooks
  rebuilds indexes
  checks invariants
```

This boundary gives Slice both semantic intelligence and durable integrity.

## Interruption Policy

Slice asks for user judgment when the partner needs grounding.

User judgment is needed for:

- sensitive memories
- identity-level claims
- inference beyond grounded input
- ambiguous entity identity
- memory rewrites or contradictions
- external account access or tool permission
- user-requested review before saving

Ordinary durable updates happen quietly and remain inspectable.

## Implementation Path

### Phase 1: Product Contract

- Describe Slice as an AI-powered thinking partner built on durable life capture.
- Align README, generated agent context, and adapter templates with that identity.
- Frame plugins as ways to use captured information.
- Keep CLI language available for manual operation and tests.

### Phase 2: Structured Slice Capture

- Keep slice as the durable memory unit.
- Write slice bodies as structured narrative sentences.
- Extract entity seeds during capture.
- Update `entities/registry.yaml` mechanically.
- Validate slice/entity consistency.

### Phase 3: Retrieval-Grounded Answering

- Search slices and entities for relevant context.
- Assemble context for the partner before answering.
- Surface stored memory when it shapes the answer.
- Keep generated retrieval indexes rebuildable.

### Phase 4: Source Connectors

- Treat external sources as input streams into the same slice/entity system.
- Start with Gmail and Calendar.
- Add source metadata to slices.
- Preserve source provenance for retrieved facts.

### Phase 5: Partner Capability API

- Add MCP tools for agent-native use.
- Expose operations in partner language:
  - remember
  - retrieve context
  - inspect entity
  - connect source
  - use plugin capability
- Keep CLI as a shell over the same capabilities.

### Phase 6: Executable Plugins

- Add `plugin.json` manifests.
- Add event-triggered hooks.
- Add plugin permissions.
- Add the Slice plugin runner.
- Define typed event payloads and plugin effects.
- Record plugin execution results.
- Keep `PLUGIN.md` as readable policy.
- Let plugins own focused stories and views.

## Open Questions

- What is the exact schema for a structured memory intent from the AI partner?
- What metadata should every slice carry for source provenance?
- How should external source items be deduplicated against conversation slices?
- How much entity ambiguity should the system resolve mechanically before asking?
- Which retrieval strategy gives the partner enough context without flooding it?
- Which plugin events belong in the first executable plugin release?
- What sandbox and permission model should the plugin runner enforce?
- What effect schema should plugin hooks return?

## Design Principles

- Slice is a thinking partner built on durable life capture.
- Slices store coherent pieces of the user's thinking and life.
- Entities give the captured corpus stable referents.
- Retrieval turns stored context into useful answers.
- Plugins are focused ways to use captured information.
- Slice owns the plugin runtime and execution environment.
- AI handles semantic distillation.
- System code handles durable state and validation.
- Source provenance stays attached to captured material.
- Conceptual gaps stay visible as open questions.
- Solutions fit the core capture/entity/retrieval model before tactical details
  are chosen.
