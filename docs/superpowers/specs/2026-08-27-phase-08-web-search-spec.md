# Fase 08 — Web Search (Tavily + Citations + Fair Compare) — Spec

> Status: DRAFT — Menunggu review (brainstorming assume approved). DILARANG bikin plan/code sebelum approve plan.
> Referensi: `docs/MILESTONES.md` Milestone 8, `docs/ARCHITECTURE.md` §11 Web Search Architecture, `docs/DATABASE.md` §5 web_sources, `docs/API.md` §7 Web Search API, `docs/PRD.md` FR-017 + Acceptance Web Search, `docs/AI-BEHAVIOR.md` §16 Web Search + §17 Citations + Fair Compare, `docs/UI-UX.md` Web Source/Citation UI + Composer Web Toggle, `docs/ERROR-HANDLING.md` ERR-015, `docs/SECURITY.md` Server-Only Tavily, `DESIGN.md`, `.agents/rules/anti-ai-slop.md`

## 1. Tujuan (Brainstorming Architectural — assume approved)

Memungkinkan user toggle `enableWebSearch` di Composer → server query Tavily `searchDepth basic/advanced` → simpan `web_sources` per `generationRunId` → inject `Web context:\n[1] title url snippet` ke `system` prompt (cite `[1][2]`) → model jawab dengan citations `[1][2]` + drawer sources clickable `title - url truncated - snippet` White 10px. Untuk Compare, `searchWeb` sekali dan dikirim identik ke semua model (Fair Compare) agar benchmarking adil, tidak per-model fetch.

## 2. Scope & Dependensi

- **Dependensi:** Fase 05 Done (Compare `comparison_runs` + `generation_runs` `Promise.allSettled` parallel, `Composer` placeholder), Fase 03 Done (`generation_runs` `promptTokens` etc., `buildSystemPrompt` cite instruction, `WorkspaceShell`), Fase 04 Done (`conversations` ownership `where userId`), Fase 01-02 Done. Fase 02 `vector` extension tidak dibutuhkan Fase 08 (tapi RAG Fase 07 + web Fase 08 combine ready — `document_chunks` HNSW + `web_sources` both inject).
- **Deliverable Fase 08:**
  1. `web_sources` table + HNSW? tidak, btree `generationRunId` `conversationId` `position`
  2. `src/lib/tavily/client.ts` server-only abstraction `SearchProvider` `TavilyProvider` `fetch https://api.tavily.com/search` `TAVILY_API_KEY tvly-...`
  3. `src/server/functions/search.ts` `searchWeb` standalone `POST` Zod `query 1-500` `searchDepth basic|advanced` → `searchProvider.search` → `return {results}` graceful `ERR-015` empty if fail (no `web_sources` insert tanpa `generationRunId`)
  4. `Composer` Globe toggle `enableWebSearch` boolean `aria-pressed` `bg-sandstone` active + Fresh Grass dot
  5. `chat.ts` `sendMessage` `enableWebSearch` → `searchProvider.search` once → `INSERT web_sources` N rows per `genId` `position 0..N-1` `score` `snippet 500` → `system = buildSystemPrompt(hasWebSources) + "\n\nWeb context (cite as [1],[2]):\n"+webResults.map`
  6. `sendCompareMessage` Fair Once → `searchProvider.search` once before loop → same `webResults` → `INSERT web_sources` per `genId` same `position`/`score` → `system` same ke semua `streamText`
  7. `CitationDrawer` White 10px chips `[1]` `bg-sandstone` + drawer list `title/url/snippet` Body-sm `ExternalLink` collapsible
  8. Error graceful `ERR-015` toast `Web search unavailable. Responding without web results.` no chips, chat still streams
- **Out of scope:** Exa advanced research `EXA_API_KEY` optional future, `LANGFUSE` per-web tracing Fase 09, `consensus`/`blind` Fase 11.

## 3. Data Model

**`web_sources`**

- `id uuid PK default gen_random_uuid()`
- `generationRunId uuid FK generation_runs.id ON DELETE CASCADE not null` — link ke generation yang pakai source
- `conversationId uuid FK conversations.id ON DELETE CASCADE not null` — scoping + cleanup, index
- `url text not null`
- `title text nullable` (Tavily `title`)
- `snippet text nullable` (`content` truncated 500 chars)
- `score real nullable` (Tavily `score` relevance)
- `position integer not null` 0..N-1 order
- `createdAt timestamptz default now()`
- Indexes `generationRunId`, `conversationId`, `generationRunId+position`

**Migration:** `0007_web_sources.sql` `CREATE TABLE web_sources ...` + `CREATE INDEX` via `drizzle-kit generate`.

**Relasi:** `generation_runs ||--o{ web_sources`, `conversations ||--o{ web_sources`, delete `generation_runs`/`conversations` → cascade.

## 4. Tavily Client (ARCHITECTURE §11, ENVIRONMENT.md TAVILY_API_KEY)

### 4.1 Abstraction `src/lib/tavily/client.ts` server-only

- **SDK:** `fetch` MVP (tidak `@tavily/core` biar YAGNI), interface `SearchProvider` agar bisa ganti Exa:
  ```ts
  export interface SearchProvider { search(query:string, opts?:{searchDepth?:'basic'|'advanced', maxResults?:number}): Promise<Array<{url:string, title:string, content:string, score:number}>>; }
  export class TavilyProvider implements SearchProvider { async search(query, opts) { const res=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json"}, body:JSON.stringify({api_key:process.env.TAVILY_API_KEY!, query, search_depth:opts?.searchDepth ?? 'basic', max_results:opts?.maxResults ?? TAVILY_MAX_RESULTS, include_answer:false})}); if(!res.ok) throw Object.assign(new Error("Web search unavailable. Responding without web results."),{code:"ERR-015"}); const data=await res.json(); return data.results.map((r:any)=>({url:r.url, title:r.title, content:r.content, score:r.score})); } }
  export const searchProvider = new TavilyProvider();
  ```
- **No client exposure:** `TAVILY_API_KEY` server-only `src/lib/tavily/client.ts` tidak di `components/*`.
- **Constants:** `TAVILY_MAX_RESULTS = Number(process.env.TAVILY_MAX_RESULTS ?? 5)` `src/lib/utils/constants.ts` single source, `TAVILY_TIMEOUT_MS` TBD 10000.

### 4.2 Env

- `TAVILY_API_KEY` required `tvly-...` `env.server.ts` `z.string().startsWith("tvly-")`, `TAVILY_BASE_URL` optional default `https://api.tavily.com`.

## 5. API Contracts

### 5.1 `searchWeb` standalone `POST` `createServerFn`

- **Validator:** `z.object({query: z.string().min(1).max(500), searchDepth: z.enum(["basic","advanced"]).default("basic")})`
- **Auth:** `getAuthSession` 401
- **Behavior:** `getAuthSession` → `results=await searchProvider.search(query, {searchDepth})` try/catch `ERR-015` → `return {results:[]}` graceful (log `Tavily fail` console/Langfuse) → `return {results}` (no `web_sources` insert tanpa `generationRunId` karena `generationRunId not null` schema, standalone skip insert). Return `Array<{url,title,content,score}>`.

### 5.2 `sendMessage` extend `enableWebSearch` `z.boolean().optional().default(false)` (sudah placeholder Fase 03, Fase 08 aktif)

- **Flow:** `getAuthSession` 401 → `getModelById` 400 → `cost` check 402 before Tavily → get/create `conversations` mode `normal` verify `userId` 403 → insert `userMsg` → deduct → insert `assistant` + `generation_runs` `genId` → **if `enableWebSearch===true`:** `webResults=await searchProvider.search(data.content, {searchDepth:'basic', maxResults:TAVILY_MAX_RESULTS}).catch(e=>{console.error("Tavily ERR-015",e); return [];})` → if `webResults.length` → `INSERT web_sources` N rows `{generationRunId:genId, conversationId:convId, url, title, snippet:content.slice(0,500), score, position:i}` → `webContext=webResults.map((r,i)=>`[${i+1}] ${r.title} - ${r.url}\n${r.content.slice(0,500)}`).join("\n\n")` → `system=buildSystemPrompt({skillId, hasWebSources:true}) + "\n\nWeb context (cite as [1],[2]):\n"+webContext` else `system=buildSystemPrompt` → `streamText({model:nineRouter(routerModelId), system, messages:history})` → `source` event `{type:'source', sources: webResults.map(r=>({title:r.title, url:r.url}))}` first chunk before `text-delta` → `onFinish` update `generation_runs` + `usage_records`. If Tavily fail → 0 `web_sources` `system` without web + toast `Web search unavailable` no throw.

### 5.3 `sendCompareMessage` Fair Compare `enableWebSearch`

- **If `enableWebSearch`:** `webResultsCompare=await searchProvider.search(data.content).catch(()=>[])` **once** before loop `data.modelIds` → `hasWebCompare=webResultsCompare.length>0` → `systemCompare=buildSystemPrompt(hasWebSources) + webContext` same → after `genIds` created `N` `generation_runs`, for each `genId` insert `web_sources` same `webResultsCompare` N x results per generation (each `genId` 2 rows if 2 results). `streamText` per model same `systemCompare` + same `webResultsCompare` → `source` event same per generation. `fetch` call count 1 via spy.
- **If fail** → same graceful no web context for any model.

## 6. UI Citation + Composer

### 6.1 Inline Chips di Assistant Message `MessageList.tsx` / `ModelColumn.tsx`

- Under `assistant` bubble, `webSources` via `generationId` join `web_sources` `ORDER BY position` → chips `flex gap-1 flex-wrap` `<a href={s.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-sandstone rounded-[10px] text-xs text-ink-black hover:bg-pure-white border border-hairline-mist">[{s.position+1}]</a>` + `Sources (3)` button `ChevronDown` Lucide 12 collapsible.

### 6.2 `CitationDrawer` `src/components/chat/CitationDrawer.tsx` White `rounded-[10px]` `border #d5d5d4` `p-3` `Body-sm` 15px

- **Container:** `bg-pure-white rounded-[10px] border border-hairline-mist p-3 space-y-2` `isOpen` state `true` default collapsible via `Sources (n)` header `12px Stone Gray` `ChevronDown` rotate.
- **List:** `sources.sort(position).map` row `flex gap-2 p-2 rounded-[10px] hover:bg-sandstone` left `[1]` badge `10px pill bg-sandstone` Ink 12, middle `title 15px 500 Ink truncate` + `url 13px Stone truncate` `https://example.com/...` + `snippet 14px Stone line-clamp-2`, right `ExternalLink 12 Stone`, click `window.open(url, "_blank")`.
- **Position:** below assistant message before footer metrics, inside `ModelColumn` per column for Compare.

### 6.3 Composer Globe Toggle `src/components/chat/Composer.tsx`

- **Button:** left group after `SkillSelector` `Globe` Lucide 16 `stroke 1.5` pill `10px` `rounded-[10px]` `border hairline-mist bg-pure-white` active `bg-sandstone border-ink-black` + Fresh Grass dot `w-2 h-2 rounded-full bg-fresh-grass` + text `Web` 13px `aria-pressed` boolean, `title="Real-time web search via Tavily"`, `onClick toggle setEnableWebSearch(v=>!v)`, state `enableWebSearch` `useState(false)` `localStorage` optional, pass to `onSend({content, modelId, skillId, enableWebSearch, attachmentIds})`.

## 7. Security

- `TAVILY_API_KEY` server-only `src/lib/tavily/client.ts` not imported in `components/*` — grep `TAVILY_API_KEY` in `.vinxi/build/client` → 0, `web_sources` ownership via `conversationId` `conversations.userId` verified in `getMessages` before return sources, `searchWeb` `getAuthSession`.

## 8. Testing

- **Unit `tavily.test.ts`:** mock `fetch https://api.tavily.com/search` `results 2` `score 0.95/0.88` → `searchProvider.search("hello")` 2 `score` correct `searchDepth basic` passed, `citation.test.ts` `CitationDrawer` 2 sources chips `[1][2]` clickable `Sources (2)` collapsible.
- **Integration `search.test.ts` real PG mock Tavily+9Router:** `searchWeb hello` → 2 results 0 `web_sources`, `sendMessage enableWebSearch` mock Tavily 2 → `web_sources` 2 rows `position 0/1` `score 0.95` `snippet 500` `system` contains `Web context` `[1]` url, `enableWebSearch` fail → 0 `web_sources` `system` without web, `sendCompare enableWebSearch 2 models` → `fetch` count 1 `web_sources` total 4 rows N x results same urls `system` same, ownership `user B getMessages A 403`.
- **E2E `websearch.spec.ts` Playwright mock Tavily 2 + mock 9Router streaming real DB:** login → `/chat/$id` → Globe visible → click on → `halo` → `berita terkini AI` Send `enableWebSearch true` → chips `[1][2]` visible `aria-pressed true` → click chip → drawer list `Understanding RAG Systems` `https://example.com/article-1` snippet, compare Fair 2 models Web on `current news` → both cols same chips `[1][2]` same drawer titles `fetch` 1, Tavily 500 → toast `Web search unavailable` no chips stream still, refresh → `web_sources` persist drawer still 2 rows.

## 9. Definition of Done

- Toggle `enableWebSearch` Globe 16 visible `aria-pressed` toggles, `enableWebSearch=true` → Tavily 5 results `web_sources` rows per `generationRunId` `position` `score` `snippet 500` `system` `Web context` `[1]` url `Cite as [1],[2]`, chips `[1][2]` inline `bg-sandstone` 10px + drawer White 10px `title/url/snippet` clickable Body-sm `ExternalLink`, Compare `fetch` count 1 same `web_sources` content to all (Fair), Tavily fail graceful toast `Web search unavailable` no drawer chat still, refresh `web_sources` persist, `tsc 0` `biome pass` unit+integration+E2E pass `grep tvly-` in client 0 no `shadow-xl`.

## 10. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/tavily/client.ts` `SearchProvider` `TavilyProvider`, `src/server/functions/search.ts` `searchWeb`, `src/components/chat/CitationDrawer.tsx`
- **Modify:** `src/lib/db/schema.ts` (+`web_sources`), `src/lib/db/migrations/0007_web_sources.sql`, `src/lib/utils/constants.ts` (+`TAVILY_MAX_RESULTS` `TAVILY_TIMEOUT_MS`), `src/server/functions/chat.ts` (`sendMessage`/`sendCompareMessage` enableWebSearch inject + `web_sources` insert + `source` event), `src/components/chat/Composer.tsx` (Globe toggle `enableWebSearch` state), `src/components/chat/MessageList.tsx` (chips+drawer per message `generationId` join `web_sources`), `src/components/chat/ModelColumn.tsx` (per-column drawer), `src/lib/env.server.ts` (`TAVILY_API_KEY tvly-...`), `src/lib/ai/system-prompt.ts` (`hasWebSources` param already)
- **Test:** `tests/unit/tavily.test.ts` `citation.test.ts`, `tests/integration/search.test.ts`, `tests/e2e/websearch.spec.ts`

## 11. Larangan Khusus (jangan halu)

- DILARANG hardcode `TAVILY_API_KEY` atau `https://api.tavily.com/search` di komponen client — server-only `tavily/client.ts`
- DILARANG fetch Tavily per-model di `sendCompareMessage` — **sekali** Fair (spy `fetch` count 1 vs N)
- DILARANG expose `TAVILY_API_KEY` di client bundle — `grep tvly-` 0
- DILARANG hardcode `maxResults 5` di banyak file — single `TAVILY_MAX_RESULTS` constant
- DILARANG simpan `web_sources` tanpa `generationRunId` — schema `not null` must have genId
- DILARANG invent `score` range — pakai Tavily `score` real nullable
- DILARANG `shadow-xl` di drawer/chips/toggle — border `hairline-mist` White 10px
- DILARANG emoji di chips/toggle — Lucide `Globe, ExternalLink, ChevronDown, Search`
- DILARANG fake web results — Tavily real or mock only in test `msw`/`fetch` mock, not `setTimeout` mock data prod
- DILARANG block chat if Tavily fails — graceful degrade chat still

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable `TAVILY_MAX_RESULTS 5` explicit, `TAVILY_TIMEOUT_MS` TBD 10000 explicit, tidak ada `TODO`, `implement later`.
- **Internal consistency:** `web_sources` `generationRunId CASCADE` konsisten `sendMessage` `INSERT web_sources per genId position` + `sendCompare` `N x results` same `position`/`score`, `TavilyProvider search` `maxResults TAVILY_MAX_RESULTS` 5 konsisten `constants.ts` + `chat.ts` inject, `Globe` toggle `enableWebSearch` boolean konsisten `Composer` → `onSend` → `sendMessage`/`sendCompareMessage`.
- **Scope check:** Fase 08 hanya web search Tavily + citations + Fair Compare, tidak melebar ke `document_chunks` HNSW (Fase 07) — isolated, `web_sources` `position` order explicit.
- **Ambiguity check:** `searchWeb` standalone no `web_sources` insert explicit (needs `generationRunId`), `sendCompare` Fair `fetch` once explicit `spy count 1`, `TAVILY_API_KEY tvly-` explicit.

Spec siap untuk user review sebelum `writing-plans`.

