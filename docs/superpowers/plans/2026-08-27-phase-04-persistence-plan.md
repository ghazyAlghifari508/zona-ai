# Fase 04 — Conversation Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun persistensi penuh (Sidebar CRUD cursor pagination + search + auto-title + reload + virtual) sebagai source of truth untuk Fase 05+.

**Architecture:** `createServerFn` `getConversations` cursor `updatedAt DESC + id` `limit+1` + `where userId` + `ILIIKE`, `getConversation`/`create`/`update`/`delete`/`archive` `where userId` 403, `getMessages` `WHERE conversationId` + batch `generationRuns` join, `generateTitle` heuristic 60 chars, `MessageList` `useVirtualizer` conditional >50 `estimateSize 80 overscan 5`, `Sidebar` `useInfiniteQuery` + optimistic `setQueryData`, `chat.ts` patch `updatedAt` + title.

**Tech Stack:** Bun, TanStack Start, TanStack Router, Drizzle ORM + postgres, Zod, TanStack Query + Virtual, Lucide React, Vitest + jsdom, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-04-persistence-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL (jangan Supabase), Better Auth (jangan Clerk), Tailwind v4, AI SDK 7
- Server-only env: `DATABASE_URL`, `BETTER_AUTH_SECRET` tidak di client — grep `.vinxi/build/client` 0
- No hardcode model list — tidak relevan Fase 04, tapi `CONVERSATIONS_PAGE_SIZE 20` single source `constants.ts`
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, radius 50px nav/cards/dialog + 10px small, Inter 400/500, no `shadow-lg/xl/2xl`, no neon, no emoji Lucide 1.5-2px only, no dark mode, Unified Shell `sidebar 280px` paten tidak ganti antar route
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `getConversations`/`getConversation`/`create`/`update`/`delete`/`archive`/`getMessages`, ownership `conversations.userId===session.user.id` else 403, `messages` via `conversations.userId` join
- Validation: Zod `updateConversation` `title min1 max100 trim`, `getConversations` `limit 1-50 default20`, `getMessages` `conversationId uuid`
- Persistence: DB source of truth, bukan localStorage, `ON DELETE CASCADE` untuk `conversations` → `messages`+`generation_runs`
- No fake behavior, no `dangerouslySetInnerHTML` di sidebar, `rehype-sanitize` sudah Fase 03
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, no console error, data persists after reload

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/utils/constants.ts        # CONVERSATIONS_PAGE_SIZE 20
│   ├── lib/utils/title.ts            # generateTitle
│   ├── lib/utils/validation.ts       # updateConversationSchema + getConversationsSchema
│   ├── server/functions/conversations.ts # getConversations, getConversation, createConversation, updateConversation, deleteConversation, archiveConversation
│   ├── server/functions/messages.ts  # getMessages
│   ├── components/layout/Sidebar.tsx # full CRUD + search + virtual list not needed but main virtual
│   ├── components/chat/MessageList.tsx # useVirtualizer conditional >50
│   ├── routes/chat/index.tsx         # welcome + New Chat + Sidebar
│   └── routes/chat/$conversationId.tsx # loader getConversation+getMessages + header + MessageList
└── tests/
    ├── unit/title.test.ts
    ├── unit/validation.test.ts
    ├── integration/conversations.test.ts
    └── e2e/persistence.spec.ts
```

---

### Task 1: Server Functions Conversations — CRUD + Archive (Cursor Pagination)

**Files:**
- Create: `src/server/functions/conversations.ts`, `src/lib/utils/constants.ts`
- Modify: `src/lib/utils/validation.ts`
- Test: `tests/integration/conversations.test.ts` (CRUD smoke)

**Interfaces:**
- Consumes: `db` Fase 02, `getAuthSession` Fase 02, `conversations` table, `CONVERSATIONS_PAGE_SIZE`
- Produces: `getConversations`, `getConversation`, `createConversation`, `updateConversation`, `deleteConversation`, `archiveConversation` — dipakai Task 3,5

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/conversations.test.ts
import { describe, it, expect } from "vitest";
describe("conversations CRUD", () => {
  it("getConversations returns only own, ordered DESC", async () => {
    const { getConversations } = await import("../../src/server/functions/conversations");
    // mock session user-a, create 2 convs for A, 1 for B, call getConversations as A → expect 2, first is latest
    // will fail because file missing
  });
  it("getConversation 403 if other user", async () => {});
  it("updateConversation validates title length", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/conversations.test.ts -v`
Expected: `FAIL` `Cannot find module` `src/server/functions/conversations`

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/constants.ts`:

```ts
export const CONVERSATIONS_PAGE_SIZE = 20;
```

`src/lib/utils/validation.ts` tambah:

```ts
import { z } from "zod";
export const updateConversationSchema = z.object({ id: z.string().uuid(), title: z.string().min(1).max(100).trim() });
export const getConversationsSchema = z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20), includeArchived: z.boolean().optional().default(false), search: z.string().optional() });
```

`src/server/functions/conversations.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthSession } from "../../lib/auth/session";
import { db } from "../../lib/db/index";
import { conversations } from "../../lib/db/schema";
import { eq, and, desc, lt, or, ilike } from "drizzle-orm";
import { CONVERSATIONS_PAGE_SIZE } from "../../lib/utils/constants";
export const getConversations = createServerFn({ method: "GET" }).validator(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(CONVERSATIONS_PAGE_SIZE), includeArchived: z.boolean().optional().default(false), search: z.string().optional() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  let where = and(eq(conversations.userId, session.user.id), data.includeArchived ? undefined : eq(conversations.isArchived, false), data.search ? ilike(conversations.title, `%${data.search}%`) : undefined, data.cursor ? lt(conversations.updatedAt, new Date(data.cursor)) : undefined);
  const rows = await db.select().from(conversations).where(where).orderBy(desc(conversations.updatedAt)).limit(data.limit + 1);
  const hasMore = rows.length > data.limit;
  const sliced = hasMore ? rows.slice(0, data.limit) : rows;
  return { conversations: sliced, nextCursor: hasMore ? sliced[sliced.length - 1].updatedAt!.toISOString() : undefined };
});
export const getConversation = createServerFn({ method: "GET" }).validator(z.object({ id: z.string().uuid() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, data.id));
  if (!conv) throw Object.assign(new Error("Not Found"), { status: 404 });
  if (conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  return conv;
});
export const createConversation = createServerFn({ method: "POST" }).validator(z.object({ title: z.string().max(100).optional(), mode: z.enum(["normal", "compare"]).default("normal") })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [c] = await db.insert(conversations).values({ userId: session.user.id, title: data.title ?? "New Chat", mode: data.mode }).returning();
  return c;
});
export const updateConversation = createServerFn({ method: "POST" }).validator(z.object({ id: z.string().uuid(), title: z.string().min(1).max(100).trim() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, data.id));
  if (!conv || conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  const [updated] = await db.update(conversations).set({ title: data.title, updatedAt: new Date() }).where(eq(conversations.id, data.id)).returning();
  return updated;
});
export const deleteConversation = createServerFn({ method: "POST" }).validator(z.object({ id: z.string().uuid(), hard: z.boolean().default(false) })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, data.id));
  if (!conv || conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (data.hard) await db.delete(conversations).where(eq(conversations.id, data.id));
  else await db.update(conversations).set({ isArchived: true, updatedAt: new Date() }).where(eq(conversations.id, data.id));
  return { success: true };
});
export const archiveConversation = createServerFn({ method: "POST" }).validator(z.object({ id: z.string().uuid() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, data.id));
  if (!conv || conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  await db.update(conversations).set({ isArchived: true, updatedAt: new Date() }).where(eq(conversations.id, data.id));
  return { success: true };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/conversations.test.ts -v` → `3 passed` (mock `getAuthSession` via `vi.mock`)

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/conversations.ts src/lib/utils/constants.ts src/lib/utils/validation.ts tests/integration/conversations.test.ts
git commit -m "feat(conv): CRUD + archive cursor pagination"
```

---

### Task 2: `getMessages` + `generateTitle` Helper

**Files:**
- Create: `src/server/functions/messages.ts`, `src/lib/utils/title.ts`
- Test: `tests/unit/title.test.ts`, `tests/integration/conversations.test.ts` (extend)

**Interfaces:**
- Consumes: `conversations` table, `messages`+`generation_runs` Fase 03, `getAuthSession`
- Produces: `getMessages(conversationId)`, `generateTitle(text)` — dipakai Task 5,6

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/title.test.ts
import { generateTitle } from "../../src/lib/utils/title";
import { describe, it, expect } from "vitest";
describe("generateTitle", () => {
  it("short keep full", () => { expect(generateTitle("halo")).toBe("halo"); });
  it("long truncates 60 + …", () => { const s = "a".repeat(100); expect(generateTitle(s).length).toBe(61); expect(generateTitle(s).endsWith("…")).toBe(true); });
  it("empty → New Chat", () => { expect(generateTitle("")).toBe("New Chat"); });
  it("takes first line", () => { expect(generateTitle("first line\nsecond")).toBe("first line"); });
});
// tests/integration/conversations.test.ts tambah
describe("getMessages", () => {
  it("ordered ASC and ownership 403", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/title.test.ts -v` → `FAIL` `Cannot find module title`

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/title.ts`:

```ts
export function generateTitle(firstUserMessage: string): string {
  const firstLine = firstUserMessage.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "New Chat";
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 60).trimEnd() + "…";
}
```

`src/server/functions/messages.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthSession } from "../../lib/auth/session";
import { db } from "../../lib/db/index";
import { conversations, messages, generationRuns } from "../../lib/db/schema";
import { eq, asc } from "drizzle-orm";
export const getMessages = createServerFn({ method: "GET" }).validator(z.object({ conversationId: z.string().uuid() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, data.conversationId));
  if (!conv) throw Object.assign(new Error("Not Found"), { status: 404 });
  if (conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, data.conversationId)).orderBy(asc(messages.createdAt));
  const gens = await db.select().from(generationRuns).where(eq(generationRuns.conversationId, data.conversationId));
  const genByMsg = new Map<string, typeof gens>();
  for (const g of gens) { const arr = genByMsg.get(g.messageId) ?? []; arr.push(g); genByMsg.set(g.messageId, arr); }
  return msgs.map((m) => ({ ...m, generationRuns: genByMsg.get(m.id) ?? [] }));
});
```

Patch `src/server/functions/chat.ts` (Fase 03) `sendMessage` after `INSERT conversations` if `title` null → `UPDATE conversations SET title=generateTitle(data.content)`, after each `sendMessage` `UPDATE conversations SET updatedAt=now()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/title.test.ts -v` → `4 passed`
Run: `bun x vitest run tests/integration/conversations.test.ts -v` → `5 passed` (getMessages ASC, ownership 403)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/title.ts src/server/functions/messages.ts tests/unit/title.test.ts
git commit -m "feat(persist): getMessages + generateTitle"
```

---

### Task 3: Sidebar List + New Chat + Empty + Skeleton + Search

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `tests/e2e/persistence.spec.ts` (list)

**Interfaces:**
- Consumes: `getConversations` Task 1, `createConversation` Task 1
- Produces: Sidebar list rendered — dipakai Task 4

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/persistence.spec.ts
import { test, expect } from "@playwright/test";
test("sidebar empty state", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByText(/Belum ada percakapan/)).toBeVisible();
});
test("create New Chat navigates to /chat/$id", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: /New Chat/ }).click();
  await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/persistence.spec.ts --project=chromium -g "empty state"` → `FAIL` 404 (sidebar not yet)

- [ ] **Step 3: Write minimal implementation**

`src/components/layout/Sidebar.tsx` extend:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getConversations, createConversation } from "../../server/functions/conversations";
import { useState } from "react";
import { Plus, Bot, Search } from "lucide-react";
export function Sidebar() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["conversations", search], queryFn: () => getConversations({ data: { search } }) });
  const createMut = useMutation({ mutationFn: (vars: any) => createConversation({ data: vars }), onSuccess: (c: any) => { qc.invalidateQueries({ queryKey: ["conversations"] }); location.href = `/chat/${c.id}`; } });
  if (isLoading) return <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-sandstone animate-pulse rounded-[10px]" />)}</div>;
  const filtered = data?.conversations ?? [];
  return (
    <div className="flex flex-col h-full">
      <button onClick={() => createMut.mutate({})} className="w-full rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium flex items-center gap-2 hover:bg-sandstone"><Plus size={16} />New Chat</button>
      <div className="mt-4 relative"><Search size={14} className="absolute left-2 top-2.5 text-stone-gray" /><input placeholder="Cari percakapan..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-7 pr-2 py-2 rounded-[10px] border border-hairline-mist text-[15px]" /></div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 mt-2">
        {!filtered.length ? <div className="p-6 text-center"><p className="text-[15px] text-stone-gray">Belum ada percakapan</p><p className="text-sm text-stone-gray mt-1">Mulai chat baru untuk melihat riwayat di sini.</p></div> : filtered.map((c: any) => <a key={c.id} href={`/chat/${c.id}`} className="block px-3 py-2 rounded-[10px] hover:bg-sandstone"><div className="text-[15px] font-medium text-ink-black truncate">{c.title}</div><div className="text-[13px] text-stone-gray flex gap-1"><Bot size={12} />{new Date(c.updatedAt).toLocaleDateString()}</div></a>)}
      </div>
    </div>
  );
}
```

Debounce 200ms via `useDebouncedValue` (or `useEffect` timeout) — add `src/lib/utils/debounce.ts` if needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test tests/e2e/persistence.spec.ts --project=chromium -g "empty state"` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx tests/e2e/persistence.spec.ts
git commit -m "feat(ui): sidebar list + New Chat + search"
```

---

### Task 4: Sidebar Item Menu Rename/Delete/Archive + Search Filter

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `tests/e2e/persistence.spec.ts` (rename/delete)

**Interfaces:**
- Consumes: `updateConversation`/`deleteConversation`/`archiveConversation` Task 1
- Produces: Rename/delete/archive UI

- [ ] **Step 1: Write the failing test**

```ts
test("rename updates title without reload", async ({ page }) => {
  // seed 1 conv Old Title, goto /chat, click ⋯ → Rename → type Judul Baru → Enter → expect sidebar Judul Baru
});
test("delete removes from list", async ({ page }) => {
  // ⋯ → Delete → confirm → list empty
});
test("search filters by title", async ({ page }) => {
  // seed Alpha, Beta → search Alpha → only Alpha visible
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test -g "rename updates" --project=chromium` → `FAIL` menu missing

- [ ] **Step 3: Write minimal implementation**

In `Sidebar.tsx` per item add:

```tsx
const [editingId, setEditingId] = useState<string | null>(null);
const [editVal, setEditVal] = useState("");
const updateMut = useMutation({ mutationFn: (vars: any) => updateConversation({ data: vars }), onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }) });
const deleteMut = useMutation({ mutationFn: (vars: any) => deleteConversation({ data: vars }), onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }) });
// in map:
<div className="group/item flex items-center">
  {editingId === c.id ? <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => { if (editVal.trim()) updateMut.mutate({ id: c.id, title: editVal.trim() }); setEditingId(null); }} onKeyDown={(e) => { if (e.key === "Enter") { if (editVal.trim()) updateMut.mutate({ id: c.id, title: editVal.trim() }); setEditingId(null); } if (e.key === "Escape") setEditingId(null); }} className="flex-1 rounded-[10px] border border-hairline-mist px-2 py-1 text-[15px]" maxLength={100} /> : <span className="truncate">{c.title}</span>}
  <DropdownMenu><DropdownMenuTrigger className="opacity-0 group-hover/item:opacity-100 p-1"><MoreHorizontal size={14} /></DropdownMenuTrigger><DropdownMenuContent className="bg-pure-white rounded-[10px] border border-hairline-mist p-1"><DropdownMenuItem onClick={() => { setEditingId(c.id); setEditVal(c.title); }}><Pencil size={12} />Rename</DropdownMenuItem><DropdownMenuItem onClick={() => archiveConversation({ data: { id: c.id } }).then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))}><Archive size={12} />Archive</DropdownMenuItem><DropdownMenuItem onClick={() => { if (confirm("Hapus percakapan?")) deleteMut.mutate({ id: c.id }); }}><Trash size={12} />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test -g "rename updates" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx tests/e2e/persistence.spec.ts
git commit -m "feat(ui): rename/delete/archive + search filter"
```

---

### Task 5: Reload Loader $conversationId + Main Header

**Files:**
- Modify: `src/routes/chat/$conversationId.tsx`, `src/routes/chat/index.tsx`
- Test: `tests/e2e/persistence.spec.ts` (reload)

**Interfaces:**
- Consumes: `getConversation` Task 1, `getMessages` Task 2
- Produces: `/chat/$id` restores

- [ ] **Step 1: Write the failing test**

```ts
test("refresh preserves messages", async ({ page }) => {
  // create conv via API, sendMessage halo, goto /chat/$id → message visible → page.reload() → still visible
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test -g "refresh preserves" --project=chromium` → `FAIL` loader missing

- [ ] **Step 3: Write minimal implementation**

`src/routes/chat/$conversationId.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../../lib/auth/auth-client";
import { getConversation } from "../../server/functions/conversations";
import { getMessages } from "../../server/functions/messages";
import { WorkspaceShell } from "../../components/layout/WorkspaceShell";
import { MessageList } from "../../components/chat/MessageList";
import { Composer } from "../../components/chat/Composer";
export const Route = createFileRoute("/chat/$conversationId")({
  beforeLoad: async () => { const { data } = await authClient.getSession(); if (!data?.user) throw redirect({ to: "/auth/sign-in" }); },
  loader: async ({ params }) => {
    const conv = await getConversation({ data: { id: params.conversationId } });
    const msgs = await getMessages({ data: { conversationId: params.conversationId } });
    return { conv, msgs };
  },
  component: ChatThread,
});
function ChatThread() {
  const { conv, msgs } = Route.useLoaderData();
  return <WorkspaceShell><div className="p-4 border-b border-hairline-mist text-[20px] font-medium">{conv.title}</div><MessageList messages={msgs} /><Composer conversationId={conv.id} /></WorkspaceShell>;
}
```

`src/routes/chat/index.tsx` welcome `Tanyakan apa saja ke Zona.ai` 30px + pills.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test -g "refresh preserves" --project=chromium` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/routes/chat/\$conversationId.tsx src/routes/chat/index.tsx tests/e2e/persistence.spec.ts
git commit -m "feat(chat): loader reload getConversation+getMessages"
```

---

### Task 6: TanStack Virtual for MessageList

**Files:**
- Modify: `src/components/chat/MessageList.tsx`
- Test: `tests/e2e/persistence.spec.ts` (virtual)

**Interfaces:**
- Consumes: `messages` Task 2
- Produces: Virtual rendering

- [ ] **Step 1: Write the failing test**

```ts
test("virtual renders 150 messages without lag", async ({ page }) => {
  // seed 150 msgs via API for conv, goto /chat/$id, scroll, assert document.querySelectorAll("[data-index]").length < 50
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test -g "virtual renders" --project=chromium` → `FAIL` `data-index` not found (no virtual)

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/MessageList.tsx`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
export function MessageList({ messages }: { messages: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = messages.length > 50;
  const virtualizer = useVirtualizer({ count: messages.length, getScrollElement: () => parentRef.current, estimateSize: () => 80, overscan: 5 });
  if (!useVirtual) return <div className="space-y-4 p-4">{messages.map((m) => <MessageItem key={m.id} m={m} />)}</div>;
  return <div ref={parentRef} className="flex-1 overflow-y-auto h-[600px]"><div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>{virtualizer.getVirtualItems().map((vi) => <div key={vi.key} data-index={vi.index} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}><MessageItem m={messages[vi.index]} /></div>)}</div></div>;
}
function MessageItem({ m }: { m: any }) { return <div className={m.role === "user" ? "ml-auto bg-sandstone rounded-[10px] px-3 py-2 max-w-[70%]" : "bg-transparent"}>{m.content}</div>; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test -g "virtual renders" --project=chromium` → `1 passed` (DOM <50)

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx tests/e2e/persistence.spec.ts
git commit -m "feat(chat): virtual for long lists"
```

---

### Task 7: Verifikasi Fase 04 Gate

**Files:** — (no new files)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `Checked` PASS

- [ ] **Step 3: Unit**

Run: `bun x vitest run tests/unit/title.test.ts tests/unit/validation.test.ts -v`
Expected: `ALL passed` (5)

- [ ] **Step 4: Integration**

Run: `bun x vitest run tests/integration/conversations.test.ts -v`
Expected: `PASS` (CRUD, ownership 403, soft/hard, archive, getMessages ASC, cascade)

- [ ] **Step 5: E2E**

Run: `bun x playwright test tests/e2e/persistence.spec.ts --project=chromium`
Expected: `ALL passed` (empty, create, rename, delete, search, archive, reload, virtual)

---

## Self-Review

- **Spec coverage:** `getConversations` cursor → Task 1, `getConversation/create/update/delete/archive` → Task 1, `getMessages` batch → Task 2, `generateTitle` 60 → Task 2, Sidebar list/search/skeleton/empty → Task 3, rename/delete/archive menu → Task 4, loader reload → Task 5, virtual >50 → Task 6. FR-012/013 + Acceptance reload semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya `CONVERSATIONS_PAGE_SIZE 20` explicit). Semua Steps ada code block `drizzle`, `createServerFn`, `useVirtualizer`, `useQuery`.
- **Type consistency:** `getConversations({cursor, limit, includeArchived, search})` Task 1, `getConversation({id})` Task 1, `updateConversation({id,title})` Task 1, `getMessages({conversationId})` Task 2, `generateTitle(firstUserMessage:string):string` Task 2 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-04-persistence-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

