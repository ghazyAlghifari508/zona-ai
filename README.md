# Zona.ai

> **The Restrained Multi-Model AI Evaluation & Reasoning Workspace**

Zona.ai is an editorial, high-performance workspace designed for rigorous side-by-side AI model comparison, grounded retrieval, and artifact collaboration. Instead of locking workflows into a single model's walled garden, Zona.ai empowers developers, researchers, and creators to query multiple frontier models simultaneously, evaluate outputs under identical deterministic conditions, and work with living artifacts in a calm, distraction-free environment.

---

## Executive Overview

Modern frontier language models diverge substantially in reasoning depth, code generation idiomaticity, creative voice, and factual accuracy. Evaluating these differences through fragmented browser tabs or biased single-model interfaces leads to incomplete conclusions, hidden hallucinations, and inefficient prompt iteration.

Zona.ai bridges this gap with a unified multi-model canvas. Users can query individual models or execute **Compare Mode**, dispatching a single prompt simultaneously across frontier models (such as GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, DeepSeek V3, and Llama 3) with synchronized context, shared search retrieval, and zero synthetic latency.

---

## The Problem: The Single-Model Blindspot

When developers or knowledge workers rely on a single default assistant:
- **Blind Faith in Hallucinations**: Subtle logical fallacies and hallucinated package methods pass undetected without immediate counter-verification.
- **Provider Lock-in & Bias**: Different architectures excel at distinct tasks (e.g., Anthropic models in code refactoring, OpenAI models in instruction following, Google models in massive context retrieval). Relying on one model restricts problem-solving agility.
- **Fragmented Copy-Paste Overhead**: Testing the same prompt across four separate model subscriptions requires manual copy-pasting, inconsistent context windows, duplicate file uploads, and fragmented conversation histories.
- **Inflated Subscription Costs**: Maintaining individual Pro/Plus subscriptions across multiple AI platforms quickly escalates monthly SaaS expenses.

---

## Core Philosophy: Radical Fairness & Determinism

Benchmarking AI models in real-world workflows requires strict scientific control. Zona.ai enforces three non-negotiable principles of radical fairness:

1. **Deterministic Input Parity**: Every model in a comparison run receives the exact same system instructions, the exact same prompt wording, and the exact same conversation history. There are no hidden provider-specific prompt boosts or asymmetric penalties.
2. **Unified External Context**: When Web Search or Document RAG is triggered, external sources are fetched once and shared identically across all active models. No model gets privileged or disparate search results.
3. **Pure Signal Fidelity**: Zona.ai never simulates fake thinking phases, synthetic token pacing, or fabricated status delays. What you see is the true raw transmission from the inference engine.

---

## Compare Mode: Orchestration & Multi-Model Workflow

Compare Mode is the core innovation of Zona.ai. Rather than sending individual requests sequentially, the engine orchestrates simultaneous multi-model execution:

- **2 to 4 Models in Side-by-Side Grid**: Select any combination of active models directly from the composer header. Compare lightweight models against heavy reasoning models, or test competing frontier LLMs head-to-head.
- **Synchronized Generation Run**: Submitting a prompt generates a top-level comparison run linked to individual generation child entities in PostgreSQL.
- **Side-by-Side Responsive Layout**: Responses render in parallel columns with synchronized scroll tracking, allowing instant visual diffing between code blocks, explanations, and architectural proposals.
- **One-Click Best Response Selection**: Mark any response as the winning output, pinning that model's context as the canonical path for subsequent follow-up turns if desired.

---

## Parallel Streaming & Multiplexed Event Architecture

To deliver genuine real-time feedback across up to four concurrent models without client network saturation, Zona.ai employs an event multiplexing architecture:

- **Single Multiplexed Stream**: Instead of firing four uncoordinated HTTP requests from the browser, the client maintains a single streaming connection to the Zona.ai server.
- **Generation-Tagged SSE Frames**: Server-Sent Event (SSE) packets are tagged with discrete `generationId` and `modelId` metadata:
  ```json
  {
    "type": "text-delta",
    "generationId": "gen_88a91b2c",
    "modelId": "claude-3-5-sonnet",
    "delta": "const memoizedValue = useMemo(() => compute(), []);"
  }
  ```
- **Zero Cross-Talk**: The frontend state reducer decodes deltas into isolated message buffers, ensuring that high-throughput models (streaming at >100 tokens/second) do not block or stutter slower, deep-reasoning models.

---

## Independent Lifecycle & Fault-Tolerant Isolation

In distributed AI systems, partial failure is an unavoidable reality: upstream providers experience momentary rate limits, timeout spikes, or content moderation blocks. Zona.ai treats partial failure as a first-class state:

- **Isolated Error Boundaries**: If Model A hits an upstream timeout while Model B and Model C are actively generating, Model A renders an actionable error card (`ERR-005: Upstream Timeout`) while Models B and C complete uninterrupted.
- **Granular Retries**: Users can retry an individual failed generation within a comparison run without re-running the entire set of models or wasting credits.
- **Independent Cancellation**: Users can cancel an individual generation (or all active generations) at any time. Aborted runs accurately record partial tokens and deduct credits strictly for tokens generated prior to termination.

---

## Dynamic Model Registry: Zero Hardcoded Models

Unlike traditional AI wrappers with static dropdown arrays baked into JavaScript bundles, Zona.ai implements a fully dynamic Model Registry:

- **Runtime Gateway Synchronization**: Available models, parameter boundaries, and capabilities are discovered dynamically from the local 9Router gateway (`/v1/models`). When a new model drops, it becomes instantly accessible without redeploying frontend assets.
- **Internal Model Abstraction**: The frontend interacts exclusively with internal model identifiers and capability contracts. Provider-specific endpoint strings, API keys, and routing quirks are entirely encapsulated within the server orchestration layer.
- **Capability-Driven UI Adaptation**: If an active model does not support file attachments or vision inputs, the UI gracefully indicates capability constraints prior to submission, preventing costly upstream contract rejections.

---

## Dynamic Capability Negotiation

Every model integrated through Zona.ai undergoes automated capability negotiation across five fundamental axes:

| Capability Flag | Description | Graceful Degradation Behavior |
|---|---|---|
| `supportsVision` | Multimodal image and diagram understanding | Converted to textual description or flagged before submit |
| `supportsTools` | Structured JSON function calling & Agent Skills | Tools automatically omitted for pure text models |
| `supportsReasoning` | Native chain-of-thought metadata transmission | Honest streaming without simulated thinking markers |
| `contextWindow` | Maximum input and output token allocation | Dynamic sliding-window context compression |
| `maxOutputTokens` | Upper threshold for generation length | Safeguards against mid-sentence model cutoffs |

---

## Web Intelligence Engine: Real-Time Grounding

When questions depend on recent developments, financial figures, library documentations, or live breaking news, Zona.ai activates its server-side Web Intelligence Engine:

- **Tavily Search Orchestration**: Search queries are formulated and dispatched directly to the Tavily AI search infrastructure on the server layer. Raw API keys remain securely guarded behind server boundaries.
- **Content Extraction & Cleaning**: Incoming web pages are parsed, stripped of advertising clutter, CSS boilerplate, and tracking scripts, yielding clean Markdown context chunks.
- **Transparent Citations**: Search results are converted into verifiable inline citations `[1]`, `[2]` linked to a dedicated Citation Drawer displaying publisher domain, published date, snippet preview, and direct external URLs.

---

## Single-Fetch Search Caching for Benchmark Integrity

In traditional multi-model tools, searching while running multiple models triggers multiple redundant API requests. This introduces two fatal flaws: quadrupled search costs and subtle search result variance across models.

Zona.ai solves this through **Single-Fetch Cached Distribution**:
1. When Compare Mode executes with search enabled, the server executes a **single** consolidated search query.
2. The extracted factual snippets are cached in memory for that comparison run.
3. The exact identical source payload is injected into the context window of every compared model.

This guarantees that differences in model outputs stem purely from intrinsic model reasoning and synthesis quality—not because Model A received different search snippets than Model B.

---

## Document Ingestion & Grounded RAG Pipeline

For deep analytical inquiries on private codebases, technical specifications, or research papers, Zona.ai integrates an enterprise-grade retrieval pipeline:

- **Cloudflare R2 Object Vault**: Uploaded PDFs, Markdown documents, and source files are encrypted and stored in Cloudflare R2 object storage. Original files are never exposed directly to public URLs.
- **Hierarchical pgvector Storage**: Extracted text is segmented into semantically dense chunks, embedded into vector representations, and indexed using PostgreSQL with `pgvector` HNSW cosine similarity.
- **Contextual Token Economy**: Rather than flooding prompt windows with raw files and exhausting context budgets, only the most relevant document chunks are dynamically injected into active comparison prompts.

---

## The Four-Stage Document Processing Flow

When a user attaches a document to a conversation:
1. **Validation & Hashing**: Server-side verification confirms MIME type, file size bounds, and SHA-256 integrity before writing to Cloudflare R2.
2. **Recursive AST Segmentation**: Documents are split into semantic nodes (preserving headers, code blocks, and markdown tables intact) with a configurable token overlap to prevent context boundary clipping.
3. **Dense Vector Indexing**: High-dimensional embeddings are generated and stored with relational attachment metadata in the PostgreSQL `document_chunks` table.
4. **HNSW Cosine Ranking**: At query time, vector similarity matches top-k candidate chunks, ranking them by cosine similarity before assembling the prompt context.

---

## Interactive Artifact Canvas

Long-form code implementations, complex SVG diagrams, financial spreadsheets, and structured technical specs should not be trapped inside narrow chat bubbles. Zona.ai introduces a dedicated **Artifact Canvas**:

- **Dual-Pane Interaction**: When a model produces a substantial code block, markdown document, or HTML snippet, it can be extracted into the side-by-side Canvas panel.
- **Interactive Live Previews**: Web components, HTML/CSS prototypes, and SVG graphics render in an isolated, sandboxed iframe runtime with zero layout bleed.
- **Syntax-Highlighted Code Inspection**: Full-featured code viewer supporting TypeScript, Python, Go, Rust, SQL, and CSS with instant clipboard copying and line-number referencing.

---

## Docked Canvas Ergonomics

The Canvas panel seamlessly integrates alongside chat conversations:
- **Collapsible Split Ratio**: Effortlessly drag to resize between the chat column and the canvas pane, or expand to full-screen view for focused reading.
- **Versioned Iteration Tabs**: As users ask models to refine or refactor code, the Canvas automatically stores and displays successive artifact revisions.
- **Bidirectional Focus**: Clicking an artifact link inside any chat turn jumps directly to that specific artifact in the Canvas, maintaining cognitive continuity.

---

## Artifact Mentions: Contextual Re-injection

When working with generated artifacts across multiple conversation turns, users can re-inject artifacts directly into the prompt stream:
- **Composer `@` Mentions**: Typing `@` inside the message composer summons a fuzzy autocomplete menu listing all artifacts created within the active conversation.
- **Surgical Token Injection**: Selecting an artifact inserts an `@artifact:id` token into the composer. During prompt assembly, the server injects the exact code or markdown content of that artifact as reference context.
- **Cross-Model Iteration**: An artifact generated by Claude 3.5 Sonnet can be mentioned and passed to GPT-4o or DeepSeek for independent security audits, unit test generation, or performance optimizations.

---

## Agent Skills & Dynamic Tool Execution

Zona.ai bridges pure text reasoning with active tool invocation:
- **Model-Agnostic Tool Schema**: Tools and Agent Skills are defined as standard JSON Schemas. Zona.ai automatically translates tool definitions into provider-compliant parameter structures for OpenAI, Anthropic, and Gemini models.
- **Visual Execution Cards**: Tool calls appear directly in the message timeline with input parameters, execution timing, and return payloads cleanly displayed in collapsible inspection cards.
- **Fail-Safe Client Policy**: Model function invocations never execute unverified or dangerous server actions without explicit user permission and backend Zod validation boundaries.

---

## Transparent Credit Ledger & Token Metering

Zona.ai replaces opaque monthly flat subscriptions with granular, verifiable credit accounting:
- **Atomic Two-Phase Deduction**: Before dispatching a generation, the server verifies sufficient credit balance. Upon completion, exact prompt and completion token counts are calculated and deducted with sub-millicent precision.
- **Zero-Markup Token Transparency**: Every generation footer features a usage breakdown showing exact prompt tokens, completion tokens, execution duration in milliseconds, and the exact credit cost incurred.
- **Immutable Transaction Ledger**: Every credit top-up, usage deduction, and refund is stored as an immutable row in the PostgreSQL `credit_transactions` table, viewable anytime in the user account settings.

---

## Midtrans Payment Gateway Integration

Zona.ai offers seamless, localized credit top-ups powered by the Midtrans payment gateway:
- **Comprehensive Payment Methods**: Users can purchase credit bundles using GoPay, QRIS, BCA/Mandiri/BNI Virtual Accounts, and major credit cards.
- **Cryptographically Signed Webhooks**: Payment confirmations are validated using SHA-512 order signature hashes to prevent replay attacks or fraudulent balance alterations.
- **Instant Balance Activation**: Once Midtrans signals payment settlement, credits are immediately deposited to the user's ledger, allowing uninterrupted generation workflows.

---

## Design Philosophy: Restrained MindMarket Aesthetic

Most contemporary AI interfaces suffer from sensory overload: dark purples, aggressive neon gradients, noisy glassmorphism, and gratuitous particle animations.

Zona.ai embraces the **MindMarket Design System**—a calm, tactile, editorial aesthetic inspired by fine Swiss typography and Japanese stationery:
- **Warm Paper Surfaces**: The primary background uses cream paper tones (`#f5f1e4`) that minimize optical fatigue during long research sessions.
- **Pure White Elevation**: Active text cards, input composers, and canvas documents rest on pure white (`#ffffff`), establishing crisp visual hierarchy without heavy dropshadows.
- **Hairline Sandstone Borders**: Subtle structure is achieved using razor-sharp 1px borders (`#e0dbce` and `#d5d5d4`) rather than blurry, high-spread shadows.

---

## Aesthetic Tokens & Anti-AI Slop Discipline

Zona.ai enforces strict UI design constraints:

| Token Category | Token Value | Semantic Purpose |
|---|---|---|
| Background Base | `#f5f1e4` | Cream paper canvas providing warmth and focus |
| Surface Card | `#ffffff` | Pure white elevated surfaces for readability |
| Hairline Border | `#e0dbce` | Subtle structural dividers and section contours |
| Accent Muted | `#2b2b2a` | Deep charcoal for legible headings and icons |
| Text Primary | `#1c1c1a` | High-contrast typography for sustained reading |
| Text Secondary | `#6b6863` | Subdued metadata, timestamps, and model badges |

**Anti-AI Slop Mandates**:
- No animated floating sparkles, gradient button borders, or cosmic backgrounds.
- No emoji clutter in system cards or navigation bars.
- High editorial typography using clean geometric sans-serif fonts paired with tabular monospaced numerals.

---

## Workspace Architecture & Thread Management

Workspaces in Zona.ai are built around clarity, rapid navigation, and permanence:
- **Sidebar Hierarchy**: Past research conversations are organized chronologically, with pinned essential threads accessible with a single click.
- **Instant Filter & Search**: Client-side filtering paired with PostgreSQL full-text search indexes enables sub-millisecond thread retrieval across thousands of historical queries.
- **Thread Ownership & Isolation**: Conversations are strictly partitioned by authenticated user identity. Sessions cannot leak across accounts.

---

## Automated Conversation Titling & Archiving

To prevent cluttered sidebars filled with generic "New Chat" entries, Zona.ai incorporates asynchronous semantic titling:
- **Background Summary Synthesis**: After the first prompt-response cycle completes, a lightweight utility model synthesizes a concise, descriptive title (3-5 words) reflecting the true core topic.
- **Zero UI Latency**: Titling runs asynchronously on the server and patches the client cache via TanStack Query without interfering with ongoing generation streams.
- **Controlled Deletion Cascades**: Deleting a conversation triggers atomic database cascades that remove messages, comparison runs, and vector embeddings while unlinking external R2 storage references.

---

## Observability, Telemetry & Langfuse Tracing

For engineering teams evaluating model performance in production, Zona.ai incorporates deep server-side observability:
- **Hierarchical Span Tracing**: Every user prompt generates a root trace in Langfuse, nesting child spans for authentication checks, vector retrieval queries, search operations, and individual model generation streams.
- **Strict Privacy Masking**: Prompts and sensitive file attachments can be masked or scrubbed from telemetry payloads according to strict enterprise privacy policies.
- **Error Anomaly Tracking**: Upstream gateway timeouts, context overflow errors, and malformed JSON tool calls are captured with full stack traces for proactive system remediation.

---

## Real-Time Latency & Generation Benchmarking

Every generation column in Compare Mode includes real-time telemetry markers:
- **Time-to-First-Token (TTFT)**: Measures the exact millisecond delta between prompt submission and the first received text chunk, revealing upstream queue latency.
- **Tokens Per Second (TPS)**: Live calculation of generation throughput across each active model stream.
- **Total Duration & Cost**: Clear summary card displaying total inference duration and exact credit consumption for each individual response.

---

## Security Architecture & Server-Side Secret Custody

Security is engineered as a foundational boundary in Zona.ai, not an afterthought:
- **Zero Browser Exposure**: Upstream API keys (`NINE_ROUTER_API_KEY`, `TAVILY_API_KEY`, `DATABASE_URL`, and Cloudflare R2 credentials) never touch the client browser bundle. All third-party interactions are orchestrated strictly server-side.
- **Better Auth Session Authorization**: Every database mutation and server query validates the caller's cryptographic session token. Direct client tampering of `userId` in payloads is completely rejected.
- **Strict Content Security Policy (CSP)**: Sandboxed iframe execution for rendered HTML artifacts blocks parent window access, preventing malicious script escalation or credential exfiltration.

---

## Data Privacy Discipline & Honest Status Transparency

Zona.ai respects user autonomy and data privacy:
- **No Training On Prompts**: User prompts and uploaded attachments are processed strictly for live inference and vector retrieval; they are never sold, harvested, or used to train third-party foundational models.
- **Honest System Status**: The interface never displays synthetic "thinking" animations unless a real reasoning delta is emitted by the model. Connection status, upstream outages, and rate limits are communicated transparently with precise error codes (`ERR-001` through `ERR-019`).

---

## Comparative Matrix: Zona.ai vs Alternatives

| Dimension | Standard Chatbot (ChatGPT / Claude) | Generic Multi-Model Wrapper | Zona.ai |
|---|---|---|---|
| **Frontier Comparison** | Single model silo; manual copy-pasting | Basic tab switching or sequential API calls | True simultaneous parallel streaming (2-4 models) |
| **Search Fairness** | Uncontrolled internal search logic | Duplicate multi-fetch search overhead | Single-fetch cached distribution across all models |
| **Model Registry** | Hardcoded to single vendor ecosystem | Hardcoded static frontend arrays | Dynamic discovery via local 9Router gateway |
| **Artifact Canvas** | Basic preview or modal popup | None or plain raw code blocks | Docked responsive canvas with versioning & `@` mentions |
| **Telemetry & Metrics** | Opaque black box | None | Real-time TTFT, TPS, duration & token accounting |
| **Design Aesthetic** | High-saturation consumer dark mode | Cluttered dashboard with neon gradients | Restrained MindMarket cream paper & pure white surfaces |
| **Billing Clarity** | $20/mo per provider subscription | Opaque markup with sudden monthly caps | Exact token ledger with transparent top-up |

---

## User Personas & Practical Evaluation Workflows

Zona.ai is calibrated for knowledge workers whose workflows demand rigorous validation across multiple frontier perspectives. Rather than trusting a single model's assertion, practitioners leverage Compare Mode across distinct operational domains.

### 1. Software Engineering & Architecture Evaluation
- **Implementation Divergence**: Test complex algorithms across Claude 3.5 Sonnet and GPT-4o side-by-side to compare idiomatic TypeScript usage, algorithmic complexity, and edge-case handling.
- **Hallucination Interception**: When generating boilerplate for new frameworks, side-by-side output quickly flags non-existent methods invented by one model.
- **Instant Code Porting to Canvas**: One-click extract the cleaner implementation into the Artifact Canvas for line-by-line inspection and test suite derivation.

### 2. Academic Research & Literature Synthesis
- **Multi-Perspective Synthesis**: Supply research papers via Document RAG and observe how different model reasoning engines interpret methodologies, statistical findings, and conflicting data points.
- **Factual Triangulation**: When researching ambiguous historical or scientific topics, parallel streaming highlights points of consensus versus claims where models diverge, prompting deeper inquiry.
- **Direct Citation Tracing**: Verify claims instantaneously using the Citation Drawer, cross-referencing extracted excerpts with live web sources.

### 3. Editorial Strategy & Localization
- **Tone & Voice Nuance**: Compare how different models adapt narrative voice—from terse technical documentation to persuasive marketing copy—without altering prompt constraints.
- **Multilingual Idiomaticity**: Evaluate translation naturalness across regional idioms (e.g., Bahasa Indonesia formal vs conversational nuances) to identify unnatural literal translations.
- **Editorial Fact-Checking**: Parallel prompts identify hyperbolic fluff and unverifiable claims across drafts before publication.

---

## Interface Anatomy: The Composer & Control Bar

The Zona.ai Composer is designed for uninterrupted cognitive flow:
- **Auto-Expanding Input Canvas**: Smooth auto-expanding textarea that accommodates single-line quick queries as comfortably as multi-paragraph architecture specifications.
- **Unified Tool Pill Bar**: Toggle Web Search, Attach Files, and select Agent Skills with discrete, non-intrusive pill controls positioned along the bottom toolbar.
- **Dynamic Model Multi-Picker**: Quickly add or remove models from the active comparison set with a popover that displays model provider families, token context sizes, and status indicators.

---

## Citation Drawer & Verifiable Fact Checking

Whenever an answer cites external literature or web intelligence:
- **Interactive Citation Numbers**: Clicking any superscript reference `[1]` smoothly slides open the Citation Drawer.
- **Contextual Source Snippet**: Review the exact excerpt extracted from the source website alongside relevance ranking scores.
- **Domain Authenticity**: Clear badge displays showing domain favicon, publish timestamp, and outbound link for independent primary-source verification.

---

## Usage Statistics & Granular Accounting Modal

Every response card includes a discrete usage summary pill that triggers the Usage Statistics Modal:
- **Detailed Token Inventory**: Audit exact input prompt tokens, cached prefix tokens, output completion tokens, and reasoning tokens.
- **Cost Computation**: View exact rupiah / credit deduction breakdown calculated against upstream provider rates.
- **Performance Benchmarks**: Compare execution latency across sibling generations in the same comparison run.
