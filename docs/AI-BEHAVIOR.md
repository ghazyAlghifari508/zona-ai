# Zona.ai - AI Behavior Specification

This document details the canonical AI behavior specification for Zona.ai, covering all aspects of generation, streaming, comparison, attachments, and error handling.

## 1. Normal Chat
- User selects a single model from the model registry.
- User sends a message.
- Server creates a user message record and an assistant message record.
- Server calls AI SDK 7 `streamText()` via `@ai-sdk/openai-compatible` pointing to 9Router.
- Stream is forwarded to the client in real-time.
- Generation record tracks status, tokens, and latency.

## 2. Compare Mode
- User selects between 2 and 4 models simultaneously (max 4 models).
- User sends a single prompt.
- Server creates a ComparisonRun and individual GenerationRuns for each model.
- Server initiates parallel `streamText()` calls for each model.
- Each stream is independent — tagged with generationId + modelId.
- Streams are multiplexed to the client.
- Client demultiplexes and renders each model's response independently.
- One model failing does NOT affect others.
- ComparisonRun status: `running` → `completed` (all succeed), `partial_failure` (some fail), or `failed` (all fail).

## 3. Model Selection
- Models are loaded from the Model Registry.
- The default model is **`Auto (Smart Router)`** (`id: auto`).
- UI shows enabled models grouped by provider/category.
- Each model displays capabilities (`vision`, `reasoning`, `tools`, `files`).
- User can only select models that are enabled and available.
- For Compare Mode, user selects between 2 and 4 explicit concrete models (e.g., `Gemini 3.7 Flash High` vs `GPT 5.6 Sol`) from a multi-select UI; `auto` is disabled in Compare Mode to guarantee a deterministic comparison.

### 3.1. Auto (Smart Router) Routing Behavior
When the selected model is `auto`:
- **Pre-execution Classification:** The server performs a lightweight, zero-latency heuristic check on the incoming prompt and context:
  - **Lightweight / Fast Tier:** Short prompts (< 100 words), general conversational greetings, factual QA, text translation, or formatting tasks $\rightarrow$ routed to fast tier (`ag/gemini-3.7-flash-low` or `cx/gpt-5.4-mini`).
  - **Heavy Reasoning Tier:** Multi-step logical queries, mathematical problem solving, RAG queries over uploaded documents, philosophical queries, or explicit requests for deep explanation $\rightarrow$ routed to `ag/gemini-3.7-flash-high` with high thinking budget.
  - **Coding & Architecture Tier:** Prompts containing code blocks, stack traces, compiler errors, database schemas, or programming keywords (`refactor`, `debug`, `implement`, `endpoint`, `regex`, `SQL`) $\rightarrow$ routed to `cx/gpt-5.6-sol`.
- **UI Transparency:** The server includes `resolvedModelId` and `routingReason` in the `generation-start` streaming event payload. The frontend displays a subtle badge above the assistant response (e.g., *"⚡ Routed to Gemini 3.7 Flash"* or *"🛠️ Routed to GPT 5.6 Sol"*).
- **Persistence:** The `generation_runs` record stores both `requestedModelId: "auto"` and `routerModelId: "<actual 9router model ID>"` for clear analytics and auditability.

## 4. Model Capabilities
- `vision`: can process image inputs.
- `reasoning`: supports extended thinking/chain-of-thought.
- `tools`: supports function/tool calling.
- `files`: can process document attachments.
- `text`: basic text generation (all models).
- Capability flags come from the Model Registry.
- If user sends an image to a non-vision model: server returns a clear error, does NOT silently drop the image.

## 5. System Prompt Strategy
- Default system prompt for Zona.ai assistant behavior.
- System prompt is server-managed, NOT user-editable in MVP.
- System prompt includes: assistant identity, response formatting guidelines, citation format when web sources are available.
- For Compare Mode: same system prompt sent to all models (fair comparison).
- System prompt is TBD/configurable content.

### 5.1. Composer Skills (Task Presets & Output Specialization)
Users can select a specialized Skill from the composer to modify how the model approaches and structures its response:
1. **`none` (Tanpa skill - Default):**
   - Standard conversational persona with natural formatting.
2. **`checklist` (Pembuat Checklist):**
   - System prompt instructs model: *"Deconstruct the user's objective into an actionable, prioritized markdown checklist using `- [ ]` checkboxes, organized into clear phases (e.g. Preparation, Implementation, Review)."*
3. **`prd-plan` (Generator PRD / Plan):**
   - System prompt instructs model: *"Structure the response as a formal implementation plan or PRD covering: Objective, Problem Statement, Core Architecture, Step-by-Step Milestones, and Definition of Done."*
4. **`agent-skill` (AI Agent Skill Creator):**
   - System prompt instructs model: *"Formulate a clean, modular agent instruction / skill file (e.g., SKILL.md / rule doc) with YAML-like metadata, specific constraints, concrete code conventions, and step-by-step guidance for an AI coding agent."*

**Skills in Compare Mode:**
- When a Skill is active during Compare Mode, the exact same specialized skill prompt is injected into all compared models, allowing users to benchmark which model writes a superior checklist, PRD, or agent skill.

## 6. Conversation Context
- Full conversation history is sent with each request.
- Context window management: if conversation exceeds model's context window, implement truncation strategy (oldest messages first, always keep system prompt).
- For Compare Mode: each model receives the SAME conversation context.
- In Normal Chat: if user switches models mid-conversation, new model receives full prior context.

## 7. Streaming
- Uses AI SDK 7's streaming protocol.
- Events flow: `generation-start` → [`reasoning-start` → `reasoning-delta`]* → `text-delta`* → [`tool-call`]* → [`source`]* → `usage` → `generation-finish`.
- Error during stream: `generation-error` event.
- Client receives typed events and updates UI reactively.
- No fake progress indicators — UI state derived from actual stream events.

## 8. Reasoning Models
- Some models (e.g., o1, DeepSeek R1) support extended reasoning/thinking.
- Reasoning output is captured separately from main response.
- UI displays reasoning in a collapsible section.
- `reasoningContent` stored in `generation_runs` table.
- `reasoning-start` and `reasoning-delta` events in stream.

## 9. Cancellation
- User can cancel an in-progress generation.
- Server aborts the AI SDK stream (`AbortController`).
- Partial content up to cancellation point is preserved.
- Generation status set to `cancelled`.
- In Compare Mode: user can cancel individual models or all at once.

## 10. Retry
- User can retry a failed generation.
- Creates a new GenerationRun for the same message.
- In Compare Mode: user can retry individual failed models.
- Retry uses the same conversation context as the original request.

## 11. Timeout
- Timeout value: TBD (configurable per model or global).
- If 9Router or provider doesn't respond within timeout: `generation-error`.
- Partial content before timeout: preserved if any was streamed.
- Timeout does NOT retry automatically — user must explicitly retry.

## 12. Fallback
- Zona.ai does NOT implement provider fallback (that's 9Router's job).
- 9Router handles auto-fallback across provider tiers.
- If 9Router itself is unreachable: surface clear error to user.

## 13. Partial Failure (Compare Mode)
- If 1 of N models fails, the others continue normally.
- Failed model shows error state in its panel.
- User can retry just the failed model.
- ComparisonRun status becomes `partial_failure`.
- Token usage and latency still tracked for successful models.

## 14. Attachments (File Input)
- Images: sent inline as file parts `{ type: 'file', data, mediaType }` (AI SDK 7 format).
- Documents (PDF, DOCX, etc.): processed through RAG pipeline, context injected into prompt.
- Capability check: if model doesn't support vision, reject image-only requests with clear error.
- For Compare Mode: all models receive the same attachment context.

## 15. RAG (Retrieval-Augmented Generation)
- User uploads document → text extraction → chunking → embedding → pgvector storage.
- When user asks about an uploaded document:
  - Query embedding generated from user's question.
  - Similarity search against `document_chunks`.
  - Top-K relevant chunks retrieved.
  - Chunks injected into prompt as context.
- Top-K: TBD (configurable).
- Embedding model: TBD (configurable).
- Chunking strategy: TBD (configurable — e.g., fixed-size with overlap, semantic chunking).

## 16. Web Search
- Triggered when user enables web search OR server determines it's needed.
- MVP: explicit user toggle (`enableWebSearch`).
- Server calls Tavily `/search` endpoint.
- Search results formatted and injected into prompt as context.
- Sources stored in `web_sources` table.
- Citations rendered in UI with source URLs.
- For Compare Mode (Fair Compare): search executed ONCE, same results sent to all models.

## 17. Citations
- When web search is used, AI response should include citations.
- Citation format: numbered references [1], [2], etc.
- System prompt instructs model to cite sources when web context is provided.
- Sources displayed below the response with title, URL, snippet.

## 18. Tool Calls
- AI SDK 7 supports tool/function calling.
- MVP: web search as a tool (if using AI SDK tool calling pattern).
- Or: web search as pre-processing step (inject results before calling model).
- Decision TBD based on implementation preference.
- Tool results are streamed as `tool-call` events.

## 19. Token Usage Tracking
- Track `promptTokens`, `completionTokens`, `totalTokens` per generation.
- Data from AI SDK's `usage` event.
- Stored in `generation_runs` and `usage_records` tables.
- Displayed in UI per generation.

## 20. Latency Tracking
- Track total `latencyMs` and `timeToFirstTokenMs`.
- Measured server-side.
- Stored in `generation_runs`.
- Displayed in UI, especially useful in Compare Mode.

## 21. Error Behavior
- Errors surfaced to user with clear, non-technical messages.
- Error details logged server-side (Langfuse trace).
- Common errors: model unavailable, rate limited, context too long, invalid input, network error.
- Never show raw error stack traces to user.
- Never expose 9Router internal details to client.
