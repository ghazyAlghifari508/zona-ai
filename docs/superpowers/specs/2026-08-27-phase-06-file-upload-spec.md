# Fase 06 — File Upload (Attachments & Vision) — Spec

> Status: DRAFT — Menunggu review. DILARANG bikin plan/code sebelum approve.
> Referensi: `docs/MILESTONES.md` Milestone 6, `docs/PRD.md` FR-014 + FR-015/016 parsial, `docs/ARCHITECTURE.md` §9 Object Storage, `docs/DATABASE.md` §4 attachments, `docs/API.md` §6 Files API, `docs/SECURITY.md` §5/10-12 File Ownership & Validation, `docs/ERROR-HANDLING.md` ERR-010/011/012/013, `docs/UI-UX.md` Attachment UI + Composer, `docs/ENVIRONMENT.md` R2_*, `DESIGN.md`, `.agents/rules/anti-ai-slop.md`, `.agents/rules/zona-ai-context.md`

## 1. Tujuan

Memungkinkan user melampirkan file ke prompt (upload ke R2, metadata di `attachments` `processingStatus pending`), preview & remove di Composer pill 50px, validasi ketat MIME allowlist + magic bytes + size `MAX_FILE_SIZE_BYTES` TBD 10MB configurable, serta mengirim image sebagai file parts `base64` ke model vision-capable via AI SDK 7 (non-vision 400 `ERR-003`). Prasyarat RAG Fase 07 (extraction/chunking).

## 2. Scope & Dependensi

- **Dependensi:** Fase 03 Done (Registry `isVisionCapable`, `sendMessage` `attachmentIds? uuid[]`, `generation_runs` status, `Composer` pill 50px) + Fase 04 Done (`conversations` `userId` ownership, `getMessages` batch) + Fase 01-02 Done (Bun TanStack `env.server.ts`, `vector` extension). Fase 01 `env.server.ts` sudah validate `R2_*` `TAVILY_*`.
- **Deliverable Fase 06:**
  1. `src/lib/r2/client.ts` server-only `S3Client` `putObject/getObject/deleteObject` key `users/{userId}/attachments/{uuid}/{sanitized}`
  2. `src/lib/utils/constants.ts` `MAX_FILE_SIZE_BYTES` + `ALLOWED_MIME_TYPES` single source + `src/lib/utils/file-validation.ts` `sanitizeFilename` + `validateMime/Size/MagicBytes` server
  3. `src/lib/db/schema.ts` `attachments` + migration `0005_attachments.sql`
  4. `src/server/functions/files.ts` `uploadFile` FormData `conversationId` required + `getAttachment` proxy + `deleteAttachment` ownership 403
  5. `Composer` Paperclip active + drag overlay Sandstone `Drop files here` + preview thumbnails 40x40 `rounded-[10px]` + badge `FileText` + remove X `Loader2` deterministic
  6. `sendMessage`/`sendCompareMessage` `attachmentIds` verify `conversationId` same + `isVisionCapable` else 400 `ERR-003` else file parts `{type:'file', data:base64, mediaType}` via `getObject`, compare same parts ke semua model
  7. Error `ERR-010` R2 500 `File upload failed` + retry per file, `ERR-011` 400 unsupported/magic, `ERR-012` 413 oversized `Maximum size: 10MB`, `ERR-013` extraction pending Fase 07 (Fase 06 tetap `pending`)
- **Out of scope:** Text extraction `extractedText` nullable saja (Fase 07 full), `document_chunks`/embedding/pgvector (Fase 07), `web_sources` (Fase 08), `usage_records` per-file.

## 3. Data Model

**`attachments`**

- `id uuid PK default gen_random_uuid()`
- `userId text FK users.id ON DELETE CASCADE`
- `messageId uuid FK messages.id ON DELETE SET NULL nullable` (link ke `messages` setelah `sendMessage`, `SET NULL` jika message dihapus)
- `conversationId uuid FK conversations.id ON DELETE CASCADE not null` (wajib, untuk RAG scoping `document_chunks.conversationId`)
- `fileName text` sanitized display (100 chars max, `replace [^a-zA-Z0-9._-]` `strip ..`)
- `fileSize integer` bytes
- `mimeType text`
- `r2Key text unique` `users/{userId}/attachments/{uuid}/{sanitized}`
- `r2Bucket text` `R2_BUCKET_NAME`
- `processingStatus text default pending` (`pending|processing|completed|failed`, `pending` di Fase 06, transisi Fase 07)
- `extractedText text nullable` (simple TXT)
- `createdAt timestamptz default now()`
- Indexes `userId`, `conversationId`, `messageId`, `r2Key unique`

**Migration:** `0005_attachments.sql` `CREATE TABLE attachments ...` + `CREATE INDEX`.

**Relasi:** `users ||--o{ attachments`, `conversations ||--o{ attachments`, `messages ||--o{ attachments` via `messageId`, `attachments ||--o{ document_chunks` Fase 07.

## 4. Object Storage + Validation

### 4.1 R2 Client `src/lib/r2/client.ts` server-only

- **SDK:** `@aws-sdk/client-s3` `S3Client({region:"auto", endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com, credentials:{accessKeyId:R2_ACCESS_KEY_ID, secretAccessKey:R2_SECRET_ACCESS_KEY}})`
- **Helpers:** `putObject({key, body:Buffer|Readable, contentType})` `PutObjectCommand({Bucket:R2_BUCKET_NAME, Key:key, Body, ContentType})`, `getObject(key)` `GetObjectCommand` → `{body:Buffer, contentType}`, `deleteObject(key)` `DeleteObjectCommand`, `headObject` optional.
- **Key pattern:** `users/{userId}/attachments/{attachmentId}/{sanitized}` `attachmentId` uuid (bukan filename user), `sanitized` 100 chars `replace ..`, no path traversal. Direct `R2_PUBLIC_URL/{r2Key}` tidak dipakai Fase 06 (proxy via `getAttachment`).

### 4.2 Validation `src/lib/utils/file-validation.ts` + `constants.ts` single source

- **Allowlist `ALLOWED_MIME_TYPES` 7 types:** `application/pdf`, `text/plain`, `text/csv`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX), `image/png`, `image/jpeg`, `image/webp`. Lain → 400 `ERR-011` `This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.`
- **Size `MAX_FILE_SIZE_BYTES`:** `Number(process.env.MAX_FILE_SIZE_BYTES ?? 10_485_760)` 10MB default TBD configurable `constants.ts` single source, `>MAX` → 413 `ERR-012` `File is too large. Maximum size: 10MB.` (pakai constant).
- **Magic bytes server:** via `file-type` atau header manual `PDF %PDF 25 50 44 46`, `PNG 89 50 4E 47`, `JPG FF D8 FF`, `DOCX PK 50 4B 03 04`, `TXT/CSV` utf8 check, mismatch `client mime` vs detected → 400 `ERR-011` `Extension/claimed type does not match magic bytes (e.g. .exe renamed .pdf)`.
- **Sanitasi:** `sanitizeFilename(original)` `path.basename` `replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100)` `replace(/\.\./g,"")`.

### 4.3 Bucket

- `R2_BUCKET_NAME` required `zona-ai-files` example, `R2_ACCOUNT_ID` required, `env.server.ts` Zod validate, `R2_PUBLIC_URL` optional not dipakai Fase 06 proxy.

## 5. API Contracts `createServerFn`/`ServerRoute` (Auth Required `getAuthSession` 401)

### 5.1 `uploadFile`

- **Method:** `POST` FormData `createServerFn` `request:Request` `request.formData()` atau `createServerFileRoute("/api/files/upload")` jika `createServerFn` tidak support multipart — pilih `createServerFn` dengan `request` manual jika TanStack Start support.
- **Request:** `FormData {file: File, conversationId: string uuid required}` — `conversationId` wajib Fase 06 (jika di `/chat` tanpa conversation `createConversation` dulu).
- **Validation:** file exists → `validateMime` 400 `ERR-011` → `validateSize` 413 `ERR-012` → `validateMagicBytes` 400 `ERR-011` → `sanitizeFilename`.
- **Flow:** `getAuthSession` 401 → verify `conversations.userId===session.user.id` 403 → `sanitized` → `attachmentId crypto.randomUUID()` → `r2Key users/{userId}/attachments/{attachmentId}/{sanitized}` → `putObject` 500 `ERR-010` `File upload failed. Please try again.` if R2 fail → `INSERT attachments pending` → return `{id,fileName,fileSize,mimeType,r2Key,processingStatus,createdAt}` (no direct R2 URL).

### 5.2 `getAttachment`

- **Request:** `{id uuid}` `GET` `createServerFn`
- **Auth + ownership:** `getAuthSession` 401 → `SELECT attachments WHERE id` → `userId!=session.user.id` 403 (via `attachments.userId` direct, atau `conversations.userId` join) → `getObject(r2Key)` → `Response(body, headers {"Content-Type": mimeType, "Content-Disposition": inline})` proxy, never direct `R2_PUBLIC_URL/{r2Key}`.

### 5.3 `deleteAttachment`

- **Request:** `{id uuid}` `POST`
- **Auth + ownership:** same 403 → `deleteObject(r2Key)` ignore if not found → `DELETE WHERE id` → `{success:true}`.

### 5.4 Integration `sendMessage`/`sendCompareMessage` extend `attachmentIds? uuid[]`

- **Validator:** `z.array(z.string().uuid()).optional()` sudah Fase 03 placeholder, Fase 06 aktif.
- **Ownership:** `SELECT attachments WHERE id IN (...) AND userId=session.user.id` count mismatch 403, `conversationId` same check `attachments.conversationId !== data.conversationId` 400.
- **Vision check:** `hasImage = attachments.some(mime.startsWith("image/"))` → `!isVisionCapable(modelId)` → 400 `ERR-003` `Model tidak mendukung vision. Pilih model vision-capable.` (no deduct), compare same check per `modelId`.
- **File parts:** if vision true → for each image `getObject(r2Key)` → `base64` → `{type:'file', data:base64, mediaType}` inject ke `streamText messages: [{role, content: [{type:'text',text:content}, ...fileParts]}]`, `UPDATE attachments SET messageId=userMsg.id WHERE id IN (...)`, document PDF etc. allow attach but no file parts (extraction pending Fase 07), compare same parts ke semua model.

## 6. UI Composer (Pill 50px White `border hairline-mist` `max-width 800px` centered, `fixed bottom` `safe-area`)

- **Button Paperclip:** `Lucide Paperclip 16px` `stroke 1.5` left group after `SkillSelector`, `onClick fileRef click accept .pdf,.docx,.txt,.csv,image/png,image/jpeg,image/webp multiple` `max 5 files`, `handleFiles(FileList)` per file `FormData` `file + conversationId` → `uploadFile` → `setAttachmentIds` + `setAttachments`.
- **Drag Overlay:** `onDragEnter` → `dragOver=true` → `absolute inset-0 bg-sandstone rounded-full flex items-center justify-center text-[15px] Stone Gray` `Drop files here` `border 2px dashed ink-black`, `onDragOver preventDefault`, `onDrop` → `handleFiles(e.dataTransfer.files)`.
- **Preview:** di atas `textarea` `flex gap-2 flex-wrap p-2` White pill inner, image `40x40 rounded-[10px] object-cover` + `fileName truncate 100` + `fileSize 12px Stone` + remove `X 12 circle bg-sandstone 16px`, doc `FileText 16 + fileName + mime badge 10px pill Sandstone 10px` + remove X, progress `Loader2 12 animate` deterministic `Uploading...` Stone Gray (bukan `setInterval` fake), success → badge normal, remove `X` → `deleteAttachment` + filter local state.
- **Send:** `onSend({content, attachmentIds})` → `sendMessage({content, attachmentIds, conversationId})` / `sendCompareMessage`, clear `attachmentIds` + preview + textarea after success, disable Send if `content.trim=="" && attachmentIds.length==0`.

## 7. Security

- **Ownership:** `attachments.userId` + `conversationId` `conversations.userId` double check, `uploadFile` insert `userId=session.user.id` only, R2 key `users/{userId}/attachments/{uuid}/{sanitized}` UUID + sanitized no `../`, `getAttachment` proxy 403 server verify, `MIME+magic+size` server-only, `MAX_FILE_SIZE_BYTES` single source, `messageId SET NULL` on delete.

## 8. Testing

- **Unit `file-validation.test.ts`:** allowlist `pdf` pass `exe` fail, `validateSize >MAX 413`, `sanitize ../evil.pdf → evil.pdf`, `validateMagicBytes exe renamed pdf MZ vs PDF header fail`, `pdf %PDF pass`, `png 89 50 pass`.
- **Unit `r2.test.ts` mock S3:** `putObject` key pattern `users/{userId}/attachments/{uuid}/{sanitized}`, `getObject` returns buffer.
- **Integration `files.test.ts` real PG mock S3 `aws-sdk-client-mock`:** `uploadFile success PDF` → row `pending` `r2Key` pattern `users/{userId}/attachments`, `reject unsupported 400` `x-msdownload`, `reject magic mismatch exe→pdf 400`, `reject oversized MAX+1 413`, `getAttachment B cannot A 403`, `delete remove R2+DB B cannot 403`, `sendMessage image+vision inject file parts base64` `streamText` called with `{type:'file'}` , `image+non-vision 400 ERR-003 no deduct`, `compare same parts`.
- **E2E `upload.spec.ts` Playwright mock R2 real DB mock 9Router:** login → `/chat/$id` → Paperclip visible → chooser `sample.pdf` → preview `sample.pdf pending spinner` → `completed` → type `ringkas dokumen` Send → streaming with file, drag `photo.png` overlay Sandstone + thumbnail 40x40, remove X one of 2, `exe renamed pdf` `Unsupported`, `MAX+1` `File is too large`, non-vision 400 `Model tidak mendukung vision`, refresh `attachments` still there `getAttachment` via `conversationId`.

## 9. Definition of Done

- Drag-drop & click upload work, progress deterministic spinner, preview 40x40 thumbnails 10px + badges + remove X
- Allowlist + magic mismatch `exe→pdf` reject 400, size `>MAX` 413 `File is too large`
- R2 key `users/{userId}/attachments/{uuid}/{sanitized}` + sanitized, ownership 403, no direct URL
- `attachments` rows `pending`, index `userId`/`conversationId`, image to vision → file parts `base64` to 9Router, non-vision 400 no deduct, document allow but pending Fase 07, delete R2+DB 403 if other user, compare same parts
- `tsc 0` `biome pass` unit+integration+E2E pass, no secret in client, no `shadow-xl`

## 10. File yang Akan Dibuat/Dimodifikasi

- **Create:** `src/lib/r2/client.ts`, `src/lib/utils/file-validation.ts` (`sanitizeFilename`, `validateMime/Size/MagicBytes`), `src/lib/utils/constants.ts` (+ `MAX_FILE_SIZE_BYTES`, `ALLOWED_MIME_TYPES`), `src/server/functions/files.ts` (`uploadFile`, `getAttachment`, `deleteAttachment`), `src/components/chat/AttachmentPreview.tsx` (thumbnails/badges), `src/components/chat/DragOverlay.tsx` (in Composer)
- **Modify:** `src/lib/db/schema.ts` (+ `attachments`), `src/components/chat/Composer.tsx` (Paperclip drag preview `attachmentIds` state), `src/server/functions/chat.ts` (`attachmentIds` + vision check + file parts), `src/lib/env.server.ts` (`R2_*` validate), `src/lib/utils/validation.ts` (`fileUploadSchema` optional)
- **Test:** `tests/unit/file-validation.test.ts`, `tests/integration/files.test.ts`, `tests/e2e/upload.spec.ts`

## 11. Larangan Khusus (jangan halu)

- DILARANG hardcode `MAX_FILE_SIZE_BYTES 10_485_760` di banyak file tanpa constant — single `constants.ts` + `process.env.MAX_FILE_SIZE_BYTES` fallback, TBD
- DILARANG hardcode `ALLOWED_MIME_TYPES` di komponen — single `file-validation.ts`
- DILARANG validasi hanya client — server MIME+magic+size+sanitasi wajib
- DILARANG `r2Key = filename` — wajib UUID + sanitized
- DILARANG expose `R2_SECRET_ACCESS_KEY` atau direct `R2_PUBLIC_URL/{r2Key}` tanpa auth
- DILARANG binary di Postgres — binary di R2, metadata di PG
- DILARANG invent `routerModelId` — vision check `getModelById` registry
- DILARANG fake progress bar — spinner deterministic dari upload state, bukan `setInterval` 0-100%
- DILARANG `shadow-xl` di preview/badge/overlay — border hairline `#d5d5d4` saja
- DILARANG emoji di preview — Lucide `FileText, Image, X, Paperclip, Loader2` 1.5-2px

---

## Spec Self-Review

- **Placeholder scan:** 0 `TBD` tanpa `configurable` kecuali Open/TBD section explicit `MAX_FILE_SIZE_BYTES TBD 10MB configurable` allowed, tidak ada `TODO`, `implement later`.
- **Internal consistency:** `attachments` `r2Key unique` konsisten `users/{userId}/attachments/{uuid}/{sanitized}` di R2 client §4.1 + validation §4.2 + API §5.1 + UI §6 preview, `ALLOWED_MIME_TYPES` 7 types konsisten PRD, `MAX_FILE_SIZE_BYTES` constant single source konsisten `constants.ts` §4.2 + validation §4.2 + error 413.
- **Scope check:** Fase 06 hanya upload + vision inline, tidak melebar ke `document_chunks` extraction (Fase 07) — isolated, `processingStatus pending` di Fase 06 benar.
- **Ambiguity check:** `conversationId required` explicit wajib (bukan orphan), `r2Key` `users/{userId}/attachments/{uuid}/{sanitized}` explicit, `file parts` `base64` explicit `via getObject`, `MIME+magic` server explicit.

Spec siap untuk user review sebelum `writing-plans`.

