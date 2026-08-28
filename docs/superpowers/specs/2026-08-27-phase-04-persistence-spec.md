# Fase 04 — Conversation Persistence — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 4, `docs/PRD.md` FR-012/013 + Acceptance Normal Chat Done, `docs/ARCHITECTURE.md` §7 DB, `docs/DATABASE.md` §2 conversations/messages + §3 generation_runs, `docs/API.md` §4 Conversations API + §5 Messages API, `docs/UI-UX.md` Sidebar/Virtual/Empty States, `DESIGN.md`, `docs/SECURITY.md` §3-4, `docs/ERROR-HANDLING.md` ERR-002/009, `docs/TESTING.md`

## 1. Tujuan

Membuat persistensi penuh sebagai source of truth: `conversations`/`messages`/`generation_runs` tersimpan PG dengan ownership ketat, dapat di-reload setelah refresh/navigasi tanpa loss, dikelola via Sidebar (list paginated cursor, create, rename, delete/archive, search `ILIIKE`, auto-title `generateTitle` 60 chars) serta di-render efisien untuk thread panjang via `useVirtualizer` conditional >50. Prasyarat Compare (Fase 05) & File (Fase 06) & RAG (Fase 07).

## 2. Scope & Dependensi

- **Dependensi:** Fase 03 Done (`generation_runs` + `credit_transactions` + `usage_records` minimal, `sendMessage` insert 2 messages + 1 generation_runs, `getAuthSession`, `Model Registry`), Fase 02 Done (PG Drizzle + `vector` extension, Better Auth Google only, `getAuthSession` helper, 5 tabel `users/sessions/accounts/conversations/messages`), Fase 01 Done (Tailwind `@theme` cream `#f5f1e4` radius 50px, `PublicShell`/`WorkspaceShell` 280px).
- **Deliverable Fase 04:**
  1. `src/server/functions/conversations.ts` 5 fns: `getConversations` cursor pagination, `getConversation`, `createConversation`, `updateConversation` rename, `deleteConversation` soft/hard, `archiveConversation`
  2. `src/server/functions/messages.ts` `getMessages` ordered ASC + batch `generationRuns` join
  3. `src/lib/utils/title.ts` `generateTitle(firstUserMessage)` heuristic 60 + `…`
  4. `src/lib/utils/constants.ts` `CONVERSATIONS_PAGE_SIZE 20` (single source)
  5. Sidebar CRUD: list paginated `useInfiniteQuery`, search debounce 200ms `ILIIKE`, rename inline, delete confirm Dialog 50px, archive, empty + skeleton Sandstone, optimistic update
  6. `src/routes/chat/$conversationId.tsx` loader `getConversation` + `getMessages` parallel + header `title` + `MessageList` virtual
  7. `MessageList.tsx` `useVirtualizer` conditional >50 `estimateSize 80 overscan 5`
  8. `src/server/functions/chat.ts` patch `UPDATE conversations SET updatedAt=now()` + `generateTitle` if `title` null after `sendMessage`
  9. `src/lib/utils/validation.ts` `updateConversationSchema` Zod `min1 max100 trim`
- **Out of scope:** `comparison_runs`/`attachments`/`document_chunks`/`web_sources`/`feedback` (Fase 05-09), RAG/Tavily, `isArchived` view filter advanced (Fase 04 hanya hide `isArchived=true` di main list), `CONVERSATIONS_PAGE_SIZE` configurable sudah.

## 3. Data Model

**Reuse `conversations`/`messages`/`generation_runs` Fase 02/03, tidak ada tabel baru Fase 04.**

- **`conversations`:** `id uuid PK`, `userId FK CASCADE`, `title nullable` (auto `generateTitle` slice 60 di Fase 04), `mode text default normal` (`normal`/`compare`), `isArchived boolean default false` (soft delete), `createdAt timestamptz`, `updatedAt timestamptz`, Index `userId + updatedAt DESC` (sidebar `ORDER BY updatedAt DESC`).
- **`messages`:** `id uuid PK`, `conversationId FK CASCADE`, `role text user|assistant|system`, `content text`, `createdAt`, Index `conversationId+createdAt ASC`.
- **`generation_runs`:** `id uuid PK`, `messageId FK CASCADE`, `conversationId FK CASCADE`, `modelId`, `routerModelId`, `skillId`, `status`, `content`, `promptTokens`, `latencyMs`, etc., Index `conversationId, messageId` — dipakai `getMessages` batch join.
- **`generateTitle`:** `firstLine.split("\n")[0].trim()` → `slice 0,60 + "…"` jika >60 else full, empty → `"New Chat"` — heuristic 0 LLM cost, future summarizer TBD Fase 10.
- **Migration:** Tidak ada `0002` baru Fase 04; jika `updatedAt` trigger belum, app-level `UPDATE ... SET updatedAt=now()` di `sendMessage`/`updateConversation`. `vector` extension sudah Fase 02.

## 4. API Contracts `createServerFn` (TanStack Start RPC, bukan REST, tapi kontrak sama)

Semua **Auth Required** `getAuthSession` → 401 `ERR-002`, Zod validator, ownership `where userId=session.user.id` else 403, 404 jika not found.

### 4.1 `getConversations`

- **Validator:** `z.object({cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20), includeArchived: z.boolean().optional().default(false), search: z.string().optional()})`
- **Auth:** `getAuthSession` 401
- **Query:** `SELECT WHERE userId=session.user.id AND (includeArchived ? true : isArchived=false) AND (search ? title ILIIKE %search% ) AND (cursor ? updatedAt < cursor::timestamptz) ORDER BY updatedAt DESC LIMIT limit+1` → `nextCursor = rows[limit].updatedAt.toISOString()` jika `rows.length>limit`, return `{conversations: rows.slice(0,limit), nextCursor}`.
- **Index:** `userId+updatedAt DESC` terpakai.

### 4.2 `getConversation`

- **Validator:** `z.object({id: z.string().uuid()})`
- **Auth:** `getAuthSession` → 401
- **Query:** `SELECT WHERE id` → 404 if null, 403 if `userId!=session.user.id` → return `conversations` tanpa `messages` (messages via `getMessages` terpisah untuk caching).
- **Return:** `{id,title,mode,isArchived,createdAt,updatedAt,userId}`

### 4.3 `createConversation`

- **Validator:** `z.object({title: z.string().max(100).optional(), mode: z.enum(["normal","compare"]).default("normal")})`
- **Auth:** `getAuthSession` → 401
- **Query:** `INSERT userId, title ?? "New Chat", mode` → return row.

### 4.4 `updateConversation` (rename)

- **Validator:** `z.object({id: z.string().uuid(), title: z.string().min(1).max(100).trim()})`
- **Auth + ownership:** `getAuthSession` → `SELECT WHERE id` → 403 if `userId!=session.user.id` → `UPDATE title, updatedAt=now() WHERE id` → return updated.

### 4.5 `deleteConversation`

- **Validator:** `z.object({id: z.string().uuid(), hard: z.boolean().default(false)})`
- **Auth + ownership:** same 403
- **Behavior:** `hard:false` → `UPDATE isArchived=true, updatedAt=now()` (soft, hide dari main list), `hard:true` → `DELETE WHERE id` (cascade `messages`+`generation_runs`).

### 4.6 `archiveConversation`

- **Validator:** `z.object({id: z.string().uuid()})`
- **Behavior:** `UPDATE isArchived=true, updatedAt=now()` (alias soft, beda `archive` vs `delete soft` untuk UI `Archive` vs `Delete`).

### 4.7 `getMessages`

- **Validator:** `z.object({conversationId: z.string().uuid()})`
- **Auth:** `getAuthSession` → 401
- **Ownership:** `SELECT conversations WHERE id=conversationId` → 404 if null, 403 if `userId!=session.user.id` → `SELECT messages WHERE conversationId ORDER BY createdAt ASC` + `SELECT generationRuns WHERE conversationId` batch → map `genByMessageId` → return `Array<{id,role,content,createdAt,generationRuns:Array}>`.

## 5. Generate Title

`src/lib/utils/title.ts`:

```ts
export function generateTitle(firstUserMessage: string): string {
  const firstLine = firstUserMessage.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "New Chat";
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 60).trimEnd() + "…";
}
```

Trigger: `src/server/functions/chat.ts` `sendMessage` after `INSERT conversations` if `title` null → `UPDATE conversations SET title=generateTitle(data.content) WHERE id=convId`; `createConversation` if `title` omitted → `title ?? "New Chat"`; future LLM summarizer TBD Fase 10.

## 6. UI Sidebar + Main

### 6.1 Sidebar `src/components/layout/Sidebar.tsx` White L1 `w-[280px]` `border-r hairline-mist` `h-screen sticky` `flex flex-col p-4`

- **Top:** logo `15px 500` + `+ New Chat` pill 50px `border ink-black` `hover bg-sandstone` full-width `onClick createConversation → navigate /chat/$id`
- **Search:** input `Cari percakapan...` `15px Stone Gray` `Lucide Search` debounce 200ms `useDebouncedValue` → `getConversations({search: debounced})` `ILIIKE` + client fallback, empty → `No results found` Stone Gray 15px
- **List:** `useQuery ["conversations", {cursor,search}]` `limit 20` `Load more` / `useInfiniteQuery`, item `px-3 py-2 rounded-[10px] hover:bg-sandstone` `active bg-sandstone border hairline`, `title 15px 500 truncate` + `Bot 12px + timestamp 13px Stone`, loading skeleton `bg-sandstone pulse` 3 rows, empty White card `Belum ada percakapan` + `Mulai chat`
- **Menu `⋯`:** `MoreHorizontal` hover visible → dropdown White 10px `Pencil Rename`, `Archive`, `Trash Delete` (Stone, bukan Coral), Rename inline `input autofocus` `onBlur/onEnter` `updateConversation` `max100` `onEscape` cancel, Delete confirm `Dialog` White 50px `Apakah hapus?` `Cancel ghost` + `Delete ink-black` → `deleteConversation` soft `isArchived` (hard via `hard:true` optional), Archive immediate `isArchived` toast
- **Bottom:** `CreditWidget` (Fase 03) + profile `avatar + LogOut` `authClient.signOut`

### 6.2 Main `src/routes/chat/$conversationId.tsx` loader

- `beforeLoad` `authClient.getSession` redirect `/auth/sign-in` (UX) + `loader: {conv: await getConversation({id}), msgs: await getMessages({conversationId})}` parallel → `ChatThread` header `title` `generateTitle` + mode badge `normal`, `MessageList` `messages=msgs`. Error 403/404 → `Percakapan tidak ditemukan` + `Kembali ke /chat` link, toast `Gagal memuat`.
- **`/chat` index:** tanpa `$id` → centered `Tanyakan apa saja ke Zona.ai` 30px + pills `suggested prompts` White 50px (Fase 03).
- **Virtual `MessageList.tsx`:** `useVirtualizer` `@tanstack/react-virtual` jika `messages.length>50` else normal: `parentRef` `overflow-y-auto` Cream, `count`, `estimateSize 80`, `overscan 5`, `getVirtualItems().map` `position:absolute top:0 transform translateY(start)` `data-index`, `MessageItem` user `bg-sandstone 10px` right 70% vs assistant `transparent` + markdown. Preserve scroll on reload, no blank.
- **Optimistic:** `Composer onSend` → `UPDATE conversations updatedAt` + `queryClient.setQueryData(["conversations"])` instantly, rollback on error; `rename/delete` optimistic `setQueryData` instantly.

## 7. Security

- **Helper reuse:** `getAuthSession` Fase 02.
- **Pattern:** `const session=await getAuthSession(request); const conv=await db.select().from(conversations).where(eq(conversations.id,id)); if(!conv || conv.userId!==session.user.id) throw 403;`
- **List filter:** `where eq(conversations.userId, session.user.id)` mandatory di `getConversations`. No `select *` tanpa where.
- **Message access:** `getMessages` must verify `conversations.userId` else 403, no leak.
- **Rate limit:** belum Fase 04 (Fase 10), tapi payload `title` max 100 Zod.
- **No secret leak:** `conversations` no secret, but `select` only needed fields.

## 8. Testing

- **Unit `tests/unit/title.test.ts`:** `generateTitle("halo")→"halo"`, long `100a` `61` `…`, `""`→`New Chat`, `first line\nsecond` → `first line`; `tests/unit/validation.test.ts` `updateConversation` `min1 max100` invalid throw.
- **Integration `tests/integration/conversations.test.ts`:** real PG test DB `migrate` → `createConversation` → `getConversations` 1 owner, `B cannot A 403`, `update rename updatedAt`, `delete soft isArchived true hard gone`, `archive isArchived`, `getMessages ordered ASC 403`, `generateTitle` in `sendMessage`, `cascade delete` `conversations` → `messages`+`generation_runs` gone.
- **E2E `tests/e2e/persistence.spec.ts`:** Playwright login → New Chat → `halo` sidebar `halo` → refresh `/chat/$id` still there → Rename `Judul Baru` → Delete → list removed → Search `Alpha` filter → Archive hide → Virtual 150 msgs scroll <50 DOM.

## 9. Definition of Done

- `getConversations` `userId` + `updatedAt DESC` cursor `limit+1` `nextCursor`, `getConversation` 403/404, `create/rename/delete/archive` + search debounce 200ms + `No results`, refresh `getConversation+getMessages` restore, `generateTitle` 60 `…`, `useVirtualizer` >50 smooth, ownership 403, `updatedAt` updated tiap `sendMessage`/`rename`, `tsc 0` `biome pass` ownership 403, `updatedAt` updated tiap `sendMessage`/`rename`, `vitest` pass.

## 10. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/server/functions/conversations.ts` (5 fns) + `messages.ts` (`getMessages`) + `src/lib/utils/title.ts` + `src/lib/utils/constants.ts` `CONVERSATIONS_PAGE_SIZE 20`
- **Modify:** `src/components/layout/Sidebar.tsx` (full CRUD search), `src/components/chat/MessageList.tsx` (virtual), `src/routes/chat/index.tsx` (welcome + New Chat), `src/routes/chat/$conversationId.tsx` (loader), `src/server/functions/chat.ts` (`updatedAt` + `generateTitle`), `src/lib/utils/validation.ts` (`updateConversationSchema`)
- **Test:** `tests/unit/title.test.ts` + `tests/integration/conversations.test.ts` + `tests/e2e/persistence.spec.ts`

## 11. Larangan Khusus

- DILARANG query tanpa `where userId` — grep `where eq(conversations.userId`
- DILARANG `select messages` tanpa verify parent `conversations.userId`
- DILARANG simpan `generation_runs` di localStorage sebagai source — DB source
- DILARANG sidebar width ganti antar route — Unified Shell 280px paten
- DILARANG `shadow-xl` di dialog confirm/dropdown
- DILARANG emoji di menu — Lucide Pencil/Trash

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD`/`TODO` kecuali Open/TBD section allowed configurable. `CONVERSATIONS_PAGE_SIZE 20` explicit, `generateTitle` 60 explicit.
- **Internal consistency:** `getConversations` cursor `updatedAt DESC` konsisten `conversations` index `userId+updatedAt`, `getMessages` batch join konsisten `generationRuns` `conversationId`, `generateTitle` slice 60 konsisten spec §5.
- **Scope check:** Fase 04 hanya persistence + search + virtual + title, tidak melebar ke `comparison_runs` (Fase 05) — isolated.
- **Ambiguity check:** `hard:false` soft `isArchived` vs `hard:true` delete explicit, `search` `ILIIKE` server + client fallback explicit, `virtual` conditional `>50` explicit.

Spec siap untuk user review sebelum `writing-plans`.

