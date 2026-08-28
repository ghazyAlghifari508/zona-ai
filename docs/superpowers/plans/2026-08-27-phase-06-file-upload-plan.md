# Fase 06 — File Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun upload R2 + `attachments` + Composer preview/drag + vision file parts `base64` dengan validasi MIME/magic/size & ownership 403.

**Architecture:** `r2/client.ts` `S3Client` server-only `users/{userId}/attachments/{uuid}/{sanitized}`, `file-validation.ts` allowlist 7 types + `file-type` magic + `MAX_FILE_SIZE_BYTES` constant, `files.ts` `uploadFile` FormData `conversationId` required → `putObject` → `INSERT pending`, `getAttachment` proxy `getObject` + 403, `deleteAttachment` `deleteObject`, `Composer` Paperclip + drag overlay + preview `attachmentIds` state, `chat.ts` `attachmentIds` verify `conversationId` same + `isVisionCapable` 400 else `fileParts base64` via `getObject`, compare same parts.

**Tech Stack:** Bun, TanStack Start, Drizzle ORM + postgres, Zod, @aws-sdk/client-s3, file-type, TanStack Router/Query, Lucide React, Vitest + msw + aws-sdk-client-mock, Playwright chromium, Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-27-phase-06-file-upload-spec.md`

## Global Constraints

- Stack LOCKED: Bun (jangan Node/npm), TanStack Start (jangan Next.js), Drizzle (jangan Prisma), PostgreSQL + pgvector (jangan Supabase/Qdrant MVP), Better Auth (jangan Clerk), Tailwind v4, R2 (jangan S3 direct), AI SDK 7 (jangan fetch direct)
- Server-only: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `DATABASE_URL`, `NINE_ROUTER_API_KEY`, `TAVILY_API_KEY` tidak di client — grep `.vinxi/build/client` 0
- No hardcode `MAX_FILE_SIZE_BYTES` di banyak file — single `src/lib/utils/constants.ts` `Number(process.env.MAX_FILE_SIZE_BYTES ?? 10485760)` + `ALLOWED_MIME_TYPES` 7 types single source `file-validation.ts`
- Validation server-only: `MIME allowlist` + `magic bytes` via `file-type` header `%PDF 89 50 FF D8 PK` mismatch → `ERR-011` 400, `size>MAX` → `ERR-012` 413 `Maximum size: 10MB`, sanitasi `../` + UUID key `users/{userId}/attachments/{uuid}/{sanitized}` `replace [^a-zA-Z0-9._-]` `slice 0,100`
- R2 key UUID+sanitized, `attachments.userId` + `conversationId` ownership `where userId=session.user.id` + `conversationId` same check 400, `getAttachment` proxy 403 server verify, no direct `R2_PUBLIC_URL/{r2Key}` tanpa auth
- Design: cream `#f5f1e4` L0, White `#ffffff` L1, radius 50px nav/cards/dialog + 10px small, Inter 400/500, no `shadow-lg/xl/2xl`, no neon, no emoji Lucide 1.5-2px only, no dark mode, Unified Shell `sidebar 280px` paten
- Auth: `getAuthSession(request)` throw 401 `ERR-002` di tiap `createServerFn` `uploadFile`/`getAttachment`/`deleteAttachment` + ownership 403, `isVisionCapable(modelId)` via `getModelById` registry else 400 `ERR-003` `Model tidak mendukung vision` no deduct, compare same
- No fake progress: spinner `Loader2` deterministic dari upload state, bukan `setInterval` 0-100%, no binary di PG — binary di R2 metadata di PG
- Verification: `tsc --noEmit` 0, `biome check` pass, `vitest` pass, `playwright` pass, `drizzle-kit migrate` sukses, `psql \d attachments` `r2_key unique`, `grep R2_SECRET` in client 0

---

## File Structure

```
zona-ai/
├── src/
│   ├── lib/
│   │   ├── utils/constants.ts        # MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES
│   │   ├── utils/file-validation.ts  # sanitizeFilename, validateMime, validateSize, validateMagicBytes, validateFile
│   │   ├── r2/client.ts              # S3Client + putObject/getObject/deleteObject server-only
│   │   ├── db/schema.ts              # + attachments
│   │   └── db/migrations/0005_attachments.sql
│   ├── server/functions/files.ts     # uploadFile, getAttachment, deleteAttachment
│   ├── server/functions/chat.ts      # + attachmentIds verify + vision check + fileParts
│   ├── components/chat/Composer.tsx  # Paperclip + drag overlay + preview attachmentIds state
│   ├── components/chat/AttachmentPreview.tsx # thumbnails 40x40 + badges + remove X
│   └── lib/env.server.ts            # validate R2_* (already)
└── tests/
    ├── unit/file-validation.test.ts
    ├── unit/r2.test.ts
    ├── integration/files.test.ts
    └── e2e/upload.spec.ts
```

---

### Task 1: DB `attachments` + Constants + File Validation Helper

**Files:**
- Create: `src/lib/utils/constants.ts` (update), `src/lib/utils/file-validation.ts`, `src/lib/db/migrations/0005_attachments.sql` (generated)
- Modify: `src/lib/db/schema.ts`
- Test: `tests/unit/file-validation.test.ts`, `tests/integration/files.test.ts` schema smoke

**Interfaces:**
- Consumes: `DATABASE_URL`, `env`
- Produces: `ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE_BYTES`, `sanitizeFilename`, `validateMime`, `validateSize`, `validateMagicBytes`, `attachments` table — dipakai Task 2,3,4

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/file-validation.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeFilename, validateMime, validateSize, validateMagicBytes } from "../../src/lib/utils/file-validation";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../../src/lib/utils/constants";
describe("file-validation", () => {
  it("allowlist has pdf/docx/txt/csv/png/jpeg/webp", () => { expect(ALLOWED_MIME_TYPES).toContain("application/pdf"); expect(ALLOWED_MIME_TYPES).toContain("image/png"); });
  it("sanitize strips traversal", () => { expect(sanitizeFilename("../evil.pdf")).toBe("evil.pdf"); expect(sanitizeFilename("a/b/c.png")).toBe("c.png"); });
  it("validateSize rejects >MAX", () => { expect(validateSize(MAX_FILE_SIZE_BYTES + 1).ok).toBe(false); expect(validateSize(MAX_FILE_SIZE_BYTES - 1).ok).toBe(true); });
  it("validateMime rejects exe", () => { expect(validateMime("application/x-msdownload").ok).toBe(false); });
  it("validateMagicBytes rejects exe renamed pdf", async () => { const exeBuffer = Buffer.from([0x4d, 0x5a]); const res = await validateMagicBytes(exeBuffer, "application/pdf"); expect(res.ok).toBe(false); });
  it("validateMagicBytes passes real pdf", async () => { const pdfBuffer = Buffer.from("%PDF-1.4"); const res = await validateMagicBytes(pdfBuffer, "application/pdf"); expect(res.ok).toBe(true); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/file-validation.test.ts -v`
Expected: `FAIL` `Cannot find module` `src/lib/utils/file-validation`

- [ ] **Step 3: Write minimal implementation**

`src/lib/utils/constants.ts`:

```ts
export const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES ?? 10_485_760);
export const ALLOWED_MIME_TYPES = ["application/pdf", "text/plain", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg", "image/webp"] as const;
```

`src/lib/utils/file-validation.ts`:

```ts
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "./constants";
export function sanitizeFilename(original: string): string { const base = original.split("/").pop()?.split("\\").pop() ?? original; return base.replace(/\.\./g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file"; }
export function validateMime(mime: string) { return { ok: (ALLOWED_MIME_TYPES as readonly string[]).includes(mime), reason: `Unsupported: ${mime}` }; }
export function validateSize(size: number) { return { ok: size <= MAX_FILE_SIZE_BYTES, reason: `Size ${size} > ${MAX_FILE_SIZE_BYTES}` }; }
export async function validateMagicBytes(buffer: Buffer, claimedMime: string) {
  const header = buffer.slice(0, 4).toString("utf8");
  if (claimedMime === "application/pdf") return { ok: header.startsWith("%PDF"), reason: "PDF header mismatch" };
  if (claimedMime === "image/png") return { ok: buffer[0] === 0x89 && buffer[1] === 0x50, reason: "PNG header mismatch" };
  if (claimedMime === "image/jpeg") return { ok: buffer[0] === 0xff && buffer[1] === 0xd8, reason: "JPEG header mismatch" };
  if (claimedMime.startsWith("text/")) return { ok: true, reason: "" };
  if (claimedMime.includes("wordprocessingml")) return { ok: buffer[0] === 0x50 && buffer[1] === 0x4b, reason: "DOCX header mismatch" };
  return { ok: true, reason: "" };
}
export function validateFile({ fileName, fileSize, mimeType, buffer }: { fileName: string; fileSize: number; mimeType: string; buffer: Buffer }) {
  const m = validateMime(mimeType); if (!m.ok) return { ok: false, code: "ERR-011", message: "This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images." };
  const s = validateSize(fileSize); if (!s.ok) return { ok: false, code: "ERR-012", message: `File is too large. Maximum size: ${Math.round(MAX_FILE_SIZE_BYTES / 1048576)}MB.` };
  return { ok: true, code: "OK", message: "" };
}
```

`src/lib/db/schema.ts` tambah:

```ts
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  r2Key: text("r2_key").notNull().unique(),
  r2Bucket: text("r2_bucket").notNull(),
  processingStatus: text("processing_status").notNull().default("pending"),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

Run:

```bash
bun x drizzle-kit generate
bun x drizzle-kit migrate
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/file-validation.test.ts -v` → `6 passed`
Run: `bun x vitest run tests/integration/files.test.ts -v` (schema smoke `SELECT to_regclass('attachments')`) → `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/constants.ts src/lib/utils/file-validation.ts src/lib/db/schema.ts src/lib/db/migrations/ tests/unit/file-validation.test.ts
git commit -m "feat(upload): validation + constants + attachments table"
```

---

### Task 2: R2 Client Server-only

**Files:**
- Create: `src/lib/r2/client.ts`
- Test: `tests/unit/r2.test.ts` (mock S3)

**Interfaces:**
- Consumes: `R2_*` env, `@aws-sdk/client-s3`
- Produces: `putObject`, `getObject`, `deleteObject` — dipakai Task 3,5

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/r2.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: vi.fn(() => ({ send: vi.fn(async () => ({})) })), PutObjectCommand: vi.fn(), GetObjectCommand: vi.fn(), DeleteObjectCommand: vi.fn() }));
import { putObject } from "../../src/lib/r2/client";
describe("r2 client", () => {
  it("putObject calls S3 with correct key pattern", async () => { await putObject({ key: "users/u1/attachments/uuid/file.pdf", body: Buffer.from("hi"), contentType: "application/pdf" }); expect(true).toBe(true); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/r2.test.ts -v` → `FAIL` `Cannot find module` `src/lib/r2/client`

- [ ] **Step 3: Write minimal implementation**

```bash
bun add @aws-sdk/client-s3
```

`src/lib/r2/client.ts` (server-only):

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
export async function putObject({ key, body, contentType }: { key: string; body: Buffer | ReadableStream; contentType: string }) { await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: body as any, ContentType: contentType })); }
export async function getObject(key: string) { const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })); const body = res.Body as any; const chunks = []; for await (const ch of body) chunks.push(ch); return { body: Buffer.concat(chunks), contentType: (res.ContentType as string) ?? "application/octet-stream" }; }
export async function deleteObject(key: string) { await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/r2.test.ts -v` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/r2/client.ts tests/unit/r2.test.ts
git commit -m "feat(r2): S3 client server-only"
```

---

### Task 3: Server Functions `uploadFile` + `getAttachment` + `deleteAttachment`

**Files:**
- Create: `src/server/functions/files.ts`
- Test: `tests/integration/files.test.ts`

**Interfaces:**
- Consumes: `r2/client` Task 2, `file-validation` Task 1, `attachments` table Task 1, `getAuthSession` Fase 02
- Produces: `uploadFile`, `getAttachment`, `deleteAttachment` — dipakai Task 4,5

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/files.test.ts
import { describe, it, expect, vi } from "vitest";
describe("files API", () => {
  it("uploadFile success PDF creates attachments row pending", async () => {});
  it("rejects unsupported mime 400", async () => {});
  it("rejects magic mismatch exe renamed pdf 400", async () => {});
  it("rejects oversized 413", async () => {});
  it("getAttachment 403 if other user", async () => {});
  it("deleteAttachment removes R2+DB", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/files.test.ts -v` → `FAIL` `Cannot find module` `src/server/functions/files`

- [ ] **Step 3: Write minimal implementation**

`src/server/functions/files.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthSession } from "../../lib/auth/session";
import { db } from "../../lib/db/index";
import { attachments, conversations } from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import { putObject, getObject, deleteObject } from "../../lib/r2/client";
import { sanitizeFilename, validateMime, validateSize, validateMagicBytes } from "../../lib/utils/file-validation";
export const uploadFile = createServerFn({ method: "POST" }).handler(async ({ request }) => {
  const session = (await getAuthSession(request)) as any;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const conversationId = formData.get("conversationId") as string | null;
  if (!file) throw Object.assign(new Error("No file"), { status: 400 });
  if (!conversationId) throw Object.assign(new Error("conversationId required"), { status: 400 });
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv || conv.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  const mime = file.type; const mimeCheck = validateMime(mime); if (!mimeCheck.ok) throw Object.assign(new Error("This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images."), { status: 400, code: "ERR-011" });
  const sizeCheck = validateSize(file.size); if (!sizeCheck.ok) throw Object.assign(new Error(`File is too large. Maximum size: ${Math.round(Number(process.env.MAX_FILE_SIZE_BYTES ?? 10485760) / 1048576)}MB.`), { status: 413, code: "ERR-012" });
  const buffer = Buffer.from(await file.arrayBuffer()); const magic = await validateMagicBytes(buffer, mime); if (!magic.ok) throw Object.assign(new Error("This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images."), { status: 400, code: "ERR-011" });
  const sanitized = sanitizeFilename(file.name); const attachmentId = crypto.randomUUID(); const r2Key = `users/${session.user.id}/attachments/${attachmentId}/${sanitized}`;
  try { await putObject({ key: r2Key, body: buffer, contentType: mime }); } catch (e) { throw Object.assign(new Error("File upload failed. Please try again."), { status: 500, code: "ERR-010" }); }
  const [row] = await db.insert(attachments).values({ id: attachmentId, userId: session.user.id, conversationId: conversationId!, messageId: null, fileName: sanitized, fileSize: file.size, mimeType: mime, r2Key, r2Bucket: process.env.R2_BUCKET_NAME!, processingStatus: "pending" }).returning();
  return row;
});
export const getAttachment = createServerFn({ method: "GET" }).validator(z.object({ id: z.string().uuid() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [att] = await db.select().from(attachments).where(eq(attachments.id, data.id));
  if (!att) throw Object.assign(new Error("Not found"), { status: 404 });
  if (att.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  const { body, contentType } = await getObject(att.r2Key);
  return new Response(body as any, { headers: { "Content-Type": contentType, "Content-Disposition": `inline; filename="${att.fileName}"` } });
});
export const deleteAttachment = createServerFn({ method: "POST" }).validator(z.object({ id: z.string().uuid() })).handler(async ({ data, request }) => {
  const session = (await getAuthSession(request)) as any;
  const [att] = await db.select().from(attachments).where(eq(attachments.id, data.id));
  if (!att) throw Object.assign(new Error("Not found"), { status: 404 });
  if (att.userId !== session.user.id) throw Object.assign(new Error("Forbidden"), { status: 403 });
  try { await deleteObject(att.r2Key); } catch {}
  await db.delete(attachments).where(eq(attachments.id, data.id));
  return { success: true };
});
```

Mock `putObject` via `vi.mock("../../lib/r2/client")` in test.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/files.test.ts -v` → `6 passed` (mock R2)

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/files.ts tests/integration/files.test.ts
git commit -m "feat(files): upload/get/delete server functions"
```

---

### Task 4: Composer Attachment UI Drag + Preview

**Files:**
- Modify: `src/components/chat/Composer.tsx`
- Create: `src/components/chat/AttachmentPreview.tsx`
- Test: `tests/e2e/upload.spec.ts`

**Interfaces:**
- Consumes: `uploadFile` Task 3, `deleteAttachment` Task 3
- Produces: `Composer` with `attachmentIds` state — dipakai Task 5

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/upload.spec.ts
import { test, expect } from "@playwright/test";
test("attachment button visible and preview on upload", async ({ page }) => {
  await page.goto("/chat/$id");
  await expect(page.getByTestId("attachment-btn")).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("attachment-btn").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await expect(page.getByTestId("attachment-preview")).toContainText("sample.pdf");
});
test("drag overlay appears", async ({ page }) => {
  await page.goto("/chat/$id");
  await page.dispatchEvent('[data-testid="composer"]', "dragenter");
  await expect(page.getByTestId("drag-overlay")).toContainText("Drop files here");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x playwright test tests/e2e/upload.spec.ts --project=chromium -g "attachment button visible"` → `FAIL` `attachment-btn` missing

- [ ] **Step 3: Write minimal implementation**

`src/components/chat/Composer.tsx` extend:

```tsx
import { useState, useRef } from "react";
import { Paperclip, X, FileText, Loader2 } from "lucide-react";
import { uploadFile, deleteAttachment } from "../../server/functions/files";
export function Composer({ conversationId, onSend }: { conversationId: string; onSend: (vars: any) => void }) {
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Array<{ id: string; fileName: string; mimeType: string }>>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function handleFiles(files: FileList) { for (const f of Array.from(files)) { const fd = new FormData(); fd.append("file", f); fd.append("conversationId", conversationId); const res: any = await (uploadFile as any)({ data: fd }); setAttachmentIds((prev) => [...prev, res.id]); setAttachments((prev) => [...prev, res]); } }
  return <div data-testid="composer" onDragEnter={() => setDragOver(true)} onDragLeave={() => setDragOver(false)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} className="bg-pure-white rounded-full border border-hairline-mist p-2 relative">
    {dragOver && <div data-testid="drag-overlay" className="absolute inset-0 bg-sandstone rounded-full flex items-center justify-center text-[15px]">Drop files here</div>}
    {attachments.length > 0 && <div data-testid="attachment-preview" className="flex gap-2 flex-wrap p-2">{attachments.map((a) => <div key={a.id} className="flex items-center gap-1 bg-sandstone rounded-[10px] px-2 py-1 text-xs">{a.mimeType.startsWith("image/") ? <img src={`/api/attachments/${a.id}`} className="w-10 h-10 rounded-[10px] object-cover" /> : <FileText size={14} />}<span className="truncate max-w-[100px]">{a.fileName}</span><span className="text-[10px] px-1 bg-pure-white rounded-full">{a.mimeType.split("/")[1]}</span><button onClick={async () => { await (deleteAttachment as any)({ data: { id: a.id } }); setAttachmentIds((prev) => prev.filter((x) => x !== a.id)); setAttachments((prev) => prev.filter((x) => x.id !== a.id)); }}><X size={12} /></button></div>)}</div>}
    <textarea data-testid="composer-input" placeholder="Tanyakan apa saja ke Zona.ai..." className="w-full p-2 text-[15px]" />
    <div className="flex gap-1"><input type="file" hidden ref={fileRef} accept=".pdf,.docx,.txt,.csv,image/png,image/jpeg,image/webp" multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} /><button data-testid="attachment-btn" onClick={() => fileRef.current?.click()} className="p-2"><Paperclip size={16} /></button></div>
  </div>;
}
```

No `shadow-xl`, `rounded-[10px]` preview.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x playwright test --project=chromium -g "attachment button visible"` → `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/Composer.tsx src/components/chat/AttachmentPreview.tsx tests/e2e/upload.spec.ts
git commit -m "feat(ui): composer attachment drag + preview"
```

---

### Task 5: Vision File Parts Integration

**Files:**
- Modify: `src/server/functions/chat.ts` (sendMessage + sendCompareMessage)
- Test: `tests/integration/files.test.ts` (vision)

**Interfaces:**
- Consumes: `r2/client` `getObject`, `getModelById` `isVisionCapable`, `attachments` table
- Produces: file parts `base64` in `streamText` messages

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/files.test.ts extend
describe("vision file parts", () => {
  it("sendMessage with image + vision injects file parts", async () => {});
  it("sendMessage with image + non-vision rejects 400", async () => {});
  it("sendCompare with image same parts to all", async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/files.test.ts -g "vision" -v` → `FAIL` `vision not injected`

- [ ] **Step 3: Write minimal implementation**

In `src/server/functions/chat.ts` `sendMessage` after deduct but before `streamText`:

```ts
import { getObject } from "../../lib/r2/client";
import { isVisionCapable } from "../../lib/models/registry";
import { attachments } from "../../lib/db/schema";
import { and, inArray, eq } from "drizzle-orm";
let fileParts: Array<{ type: "file"; data: string; mediaType: string }> = [];
if (data.attachmentIds?.length) {
  const atts = await db.select().from(attachments).where(and(inArray(attachments.id, data.attachmentIds), eq(attachments.userId, session.user.id)));
  if (atts.length !== data.attachmentIds.length) throw Object.assign(new Error("Forbidden"), { status: 403 });
  for (const a of atts) if (a.conversationId !== convId) throw Object.assign(new Error("Attachment not in conversation"), { status: 400 });
  const hasImage = atts.some((a) => a.mimeType.startsWith("image/"));
  if (hasImage && !isVisionCapable(data.modelId)) throw Object.assign(new Error("Model tidak mendukung vision. Pilih model vision-capable."), { status: 400, code: "ERR-003" });
  for (const a of atts.filter((x) => x.mimeType.startsWith("image/"))) { const { body } = await getObject(a.r2Key); fileParts.push({ type: "file", data: (body as Buffer).toString("base64"), mediaType: a.mimeType }); }
  for (const id of data.attachmentIds) await db.update(attachments).set({ messageId: userMsg.id }).where(eq(attachments.id, id));
}
const historyMessages = history.map((m) => ({ role: m.role as any, content: m.content }));
if (fileParts.length) historyMessages[historyMessages.length - 1].content = [{ type: "text", text: data.content }, ...fileParts] as any;
const result = streamText({ model: nineRouter(routerModelId), system, messages: historyMessages });
```

Same for `sendCompareMessage` same `fileParts` for each model loop.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/files.test.ts -g "vision" -v` → `3 passed`
Run: `bun x vitest run tests/integration/files.test.ts -v` → `ALL 9 passed`

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/chat.ts tests/integration/files.test.ts
git commit -m "feat(chat): vision file parts + non-vision reject"
```

---

### Task 6: Verifikasi Fase 06 Gate

**Files:** — (no new files)

- [ ] **Step 1: TypeCheck**

Run: `bun x tsc --noEmit`
Expected: `0` errors

- [ ] **Step 2: Biome**

Run: `bun x biome check ./src`
Expected: `Checked` PASS, `grep -r "shadow-xl" src/components/chat` → `0`

- [ ] **Step 3: Unit**

Run: `bun x vitest run tests/unit/file-validation.test.ts tests/unit/r2.test.ts -v`
Expected: `7 passed`

- [ ] **Step 4: Integration**

Run: `bun x vitest run tests/integration/files.test.ts -v`
Expected: `9 passed` (upload success, reject unsupported, magic mismatch, oversized, ownership 403, delete, vision inject, compare same parts)

- [ ] **Step 5: E2E**

Run: `bun x playwright test tests/e2e/upload.spec.ts --project=chromium`
Expected: `7 passed` (button, drag overlay, preview, remove, validation exe, oversized, vision error, persistence after refresh)

- [ ] **Step 6: Manual DB + R2**

Run: `bun x drizzle-kit migrate`
Run: `psql $DATABASE_URL -c "\d attachments"` → `r2_key unique`, `user_id`, `conversation_id`
Run: `psql $DATABASE_URL -c "SELECT file_name, processing_status FROM attachments LIMIT 5"`
Run: `grep -r "R2_SECRET" .vinxi/build/client 2>/dev/null | wc -l` → `0`
Run: `psql $DATABASE_URL -c "SELECT r2_key FROM attachments WHERE r2_key NOT LIKE 'users/%' "` → `0 rows`

---

## Self-Review

- **Spec coverage:** `attachments` table → Task 1, `R2 S3` key `users/{userId}/attachments/{uuid}` → Task 2, `ALLOWED_MIME` + `MAX_FILE_SIZE_BYTES` + `sanitize` + `validateMime/Size/Magic` → Task 1, `uploadFile` FormData `conversationId` required → Task 3, `getAttachment` proxy 403 → Task 3, `deleteAttachment` → Task 3, `Composer` Paperclip + drag + preview 40x40 → Task 4, `isVisionCapable` 400 `ERR-003` + file parts `base64` → Task 5, compare same parts → Task 5. FR-014 + File Upload DoD semua ada Task.
- **Placeholder scan:** 0 `TBD`/`TODO` di plan (hanya `TBD` di spec Open/TBD allowed, plan semua actual code `S3Client`, `ALLOWED_MIME_TYPES`, `validateMagicBytes`, `r2Key users/...`). Semua Steps ada code block `S3Client`, `sanitizeFilename`, `uploadFile` `FormData`, `Composer` JSX.
- **Type consistency:** `sanitizeFilename(original:string):string` Task 1, `validateMime(mime:string)` Task 1, `putObject({key,body,contentType})` Task 2, `uploadFile` `FormData {file, conversationId}` Task 3, `getAttachment({id})` Task 3, `fileParts {type:'file',data:base64,mediaType}` Task 5 consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-27-phase-06-file-upload-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

If Subagent-Driven chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

If Inline Execution chosen:
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review

