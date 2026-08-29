# Zona.ai — No Type-Safety Bypass Rules

## Core Principle

**NEVER use a type assertion, suppression comment, or loose type to make `tsc --noEmit` pass when the real fix is to model the types correctly.**

`bun x tsc --noEmit` → `0 errors` is NOT a goal in itself. It is the *verification* that types are sound. Silencing the compiler to pass the gate is **faking the gate** — it hides schema/`usage`/stream/DB type drift until it becomes a runtime crash, and it makes the codebase harder and *slower* to maintain later, not faster.

**NEVER choose the fast/loose path because the phase gate is watching.** A correct phase is one where real types are modeled; a phase that merely *compiles* while lying to the compiler is not complete.

---

## Rule 1: Forbidden Type Bypass Patterns

The following are **FORBIDDEN** anywhere in `src/` (business logic and tests), except the explicit file exemptions in Rule 3:

| Forbidden pattern | Why it's wrong | You must instead |
|---|---|---|
| `as never` / `as unknown as never` | `never` is only valid for a function that never returns; a cast TO `never` for a runtime value is never type-correct | Model the real type (see Rule 2) |
| `as any`, `: any`, `as unknown as any` | Drops all checking on that value and anything it flows into | Give the value a real type or a `satisfies`/narrowed shape |
| `as unknown as SomeType` (double bypass) | Casting through `unknown` explicitly tells TS "I don't want to check this" | Fix the source type mismatch; only use at genuine runtime boundaries with an explained comment (Rule 4) |
| `as string` / `as number` / `as Response` / `as BodyInit` on values whose real type is unrelated | Blinds the compiler to a real mismatch | Use proper union types, generics, or narrowing |
| `@ts-ignore`, `@ts-expect-error` | Suppresses an error instead of fixing the cause | Fix the underlying type/API mismatch (verify with `context7` for library APIs that changed) |
| `// biome-ignore` used for a *type/lint* problem that should be fixed by modeling types | Silences lint that exists to catch real defects | Fix the code; use the suppression only for the narrow legacy cases listed in Rule 3 |
| `as unknown as Record<string, unknown>` then ad-hoc `.status`/`.code`/field access | Bypasses the error/session/DB contract | Use a project-owned typed type (e.g. `ApiError`/`AppError` class or `$inferSelect` types) |
| casting the whole `db.insert(...).values({...} as never)` or whole function args `(x as never)` | Hides every field mismatch at once | Give Drizzle/`streamText`/SDK the genuinely correct typed input (Rule 2) |

---

## Rule 2: Fix The Real Type — Correct Patterns

Preferred tools *before* reaching for a cast:

### 2.1 Drizzle row/schema types
Use Drizzle's inference so insert/select are checked against the actual schema:

```ts
// GOOD — checked against the schema
import { schema } from '../../lib/db/schema' // or table you need
type NewUser = typeof users.$inferInsert

// jsonb columns: declare the real shape via $type() in schema.ts
export const documentChunks = pgTable('document_chunks', {
  metadata: jsonb('metadata').$type<{ startOffset: number; endOffset: number }>(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSION }),
})

// insertion in rag/process.ts — NO cast needed anywhere:
await db.insert(documentChunks).values(
  chunks.map((c) => ({
    attachmentId,
    conversationId: att.conversationId,
    chunkIndex: c.index,
    content: c.content.replace(/\x00/g, ''),
    embedding: vectors[i],          // number[] → vector column, checked
    metadata: c.metadata,           // matches $type<...>()
  })),
)
```

### 2.2 AI SDK 7 — type the messages as `CoreMessage[]`
`streamText` is checked against the SDK's real types. If `aiMessages` doesn't fit, fix its construction, don't cast:

```ts
// GOOD
import type { CoreMessage } from 'ai'
const aiMessages: CoreMessage[] = history.map((m) => ({ role: m.role, content: m.content }))
const result = streamText({ model: nineRouter(id), system, messages: aiMessages, ... })
```

### 2.3 Third-party library APIs (`unpdf`, `mammoth`, `@aws-sdk/client-s3`, `file-type`, ...)
If the SDK's official type doesn't accept your argument (`pdfExtract(u8, { mergePages: true })`), check the CURRENT API via `context7`/docs — the plan/spec likely used a correct accepted shape. If the library type is genuinely broken, keep the cast **minimal, single-level, and commented** (Rule 4) — never `as never`.

### 2.4 Errors with status/code
Define one project-owned typed error instead of fabricating fields on casts:

```ts
// GOOD
class AppError extends Error {
  constructor(message: string, readonly status = 500, readonly code = 'ERR-000') { super(message) }
}
throw new AppError('Forbidden', 403, 'ERR-003')
```

### 2.5 Unknown payloads (`JSON.parse`, `usage`, `R2 Body`)
Parse/validate instead of opaque casts where feasible (`zod` or a targeted type guard):

```ts
// GOOD (targeted, keeps the contract)
type UsageLike = { inputTokens?: number; outputTokens?: number; totalTokens?: number }
const u = usage as UsageLike // only the fields you legitimately read
```

---

## Rule 3: Allowed Narrow Exceptions Only

These are permitted **only** when justified, and each occurrence must carry an inline comment explaining the boundary:

1. **Generated/infra files are exempt from Gate scanning (not exempt from sanity):**
   - `src/routeTree.gen.ts` (TanStack Router generated — contains unavoidable `as any`)
   - `.vinxi/**`, `build/**`, `node_modules/**`
2. Test files may use a *minimal* cast when mocking strict third-party SDKs, but prefer `vi.fn()` typing / `msw` typed responses first. Tests must NOT use these to silence a real test failure.
3. `// biome-ignore` is allowed **only** for the documented legacy cases already present (e.g. `lint/suspicious/noControlCharactersInRegex` for stripping `\x00`), and the comment must state why. It may NOT be used to silence any `suspicious/noExplicitAny` introduced by new code.

Everything outside these three bullets stays FORBIDDEN.

---

## Rule 4: When A Cast Is Genuinely Unavoidable — Standard Form

If a typed SDK boundary genuinely cannot type-check (verify with current docs first), use the **narrowest, single-level** shape and explain why:

```ts
// OK — one-level, commented, boundary to SDK that lacks types
const body = new Uint8Array(buf as ArrayBufferView) // <-- avoid; prefer Buffer.isBuffer check first
```

Rules for every permitted cast:
1. Prefer narrowing/is-a-check before cast: `Buffer.isBuffer(x)`, `'content' in row`, `Array.isArray(text)`.
2. Prefer `satisfies` / typed variable annotations before `as`.
3. If you must cast, cast a **narrow, local value** — never a whole function argument list, never the whole `values({...})` object.
4. Add a comment that starts with `// cast boundary:` and names the boundary (`unpdf`, `S3 Body`, `usage`, `9Router stream`).
5. If you find yourself writing `as unknown as X`, you have already lost the check — redesign instead.

---

## Rule 5: Gate Verification — Compiler Honesty Is Checked, Not Just Output

`tsc 0 errors` alone is NOT proof. Every phase gate **must also** run a bypass scan and return zero hits in `src/`:

```bash
# in the verification gate of every phase prompt:
rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src \
  -g '!routeTree.gen.ts' || true   # expected: NO output
# strips/are-not-allowed in business code; generated routeTree exempt
```

- `rg "as never|as any|as unknown as" src -g '!routeTree.gen.ts'` → **0 matches** in `src/lib`, `src/server`, `src/routes`, `src/components`
- `rg "@ts-ignore|@ts-expect-error" src` → **0 matches** in `src/lib`, `src/server`, `src/routes`, `src/components`
- `rg "as any|: any" tests src/components src/routes` → 0 outside test files & generated files

Self-review before claiming completion:
- [ ] Every type in changed files is modeled, no value flows through `any`/`never`/`unknown` bypass
- [ ] Drizzle inserts/selects use `$inferInsert`/`$inferSelect` or typed `values()` against `schema.ts`
- [ ] `streamText` messages typed as `CoreMessage[]`; SDK args match current docs
- [ ] No suppression comments (`@ts-ignore`/`@ts-expect-error`) in new code
- [ ] `tsc --noEmit` passes BECAUSE types are right, verified by the bypass scan, not by casts

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Behavior |
|---|---|---|
| `as never` to silence `streamText`/`messages` typing | `never` is bottom type; hides every mismatch | `CoreMessage[]` with real field types |
| `values({ ... } as never)` on a Drizzle insert | Blinds the whole insert to schema changes | Schema reflection/`$inferInsert`; fix field types |
| `as unknown as Record<string, unknown>` to attach `status`/`code` to errors | Bypasses error contract & loses intellisense | Project `AppError`/typed error class |
| `js(html) cast entire function args for `unpdf`/`mammoth` | Skips verifying current API | `context7`/docs; minimal single-level cast if SDK broken |
| `@ts-ignore` binned to ship fast | Hides the bug, breaks on the next dependency bump | Fix root cause; verify current library API |
| `biome-ignore` for `noExplicitAny` in new code | Adds a `any` the system bans | Model the real type |
| Tunneling casts through `unknown` and calling it "satisfies" | `upsert AND `unknown` throwaway = no check at all | Real type via `satisfies`/typed annotation/narrowing |

---

## Summary

1. **Typechecker is a safety rail, not a checkbox.** Codes to make the gate click `0 errors` without the gates being right is a defect, not a shortcut.
2. **`as never`/`as any`/`as unknown as X`/`@ts-ignore`/`@ts-expect-error` are FORBIDDEN** in `src/lib`, `src/server`, `src/routes`, `src/components` (exemptions: generated `routeTree.gen.ts`, build dirs, narrow documented test/boundary cases).
3. **Fix the real type**: `$inferInsert`/`$inferSelect` for Drizzle, `CoreMessage[]` for AI SDK, `AppError` for errors, typed narrowing for SDK boundaries.
4. **Every gate scans for bypasses**, not just `tsc` output.
5. **Speed comes from sound types**, not from silencing the check that would have caught your bug at compile time.