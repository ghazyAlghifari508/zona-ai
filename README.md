# Zona.ai

Multi-model AI chat workspace — single chat dengan streaming, Compare Mode (2-4 model paralel), file upload + RAG, web search (Tavily), dan observability.

## Tech Stack

Bun · TanStack Start · React 19 · Tailwind CSS 4 · Drizzle ORM · PostgreSQL (+ pgvector) · Better Auth · AI SDK 7 (`@ai-sdk/openai-compatible` → 9Router) · Cloudflare R2 · Tavily · Vitest · Playwright · Biome

## Prasyarat

- Bun >= 1.2
- PostgreSQL lokal (dengan ekstensi `pgvector`)
- Layanan eksternal: 9Router, Cloudflare R2, Tavily (lihat `.env.example`)

## Setup

```bash
bun install
cp .env.example .env   # isi semua nilai yang dibutuhkan
bun x drizzle-kit migrate
bun run dev            # http://localhost:3000
```

## Perintah Verifikasi

```bash
bun x tsc --noEmit              # TypeCheck (0 error)
bun x biome check ./src         # Lint/Format
bun x vitest run                # Unit + Integration tests
bun x playwright test --project=chromium   # E2E (12 critical paths + a11y + responsive)
bun run build                   # Production build
```

## Struktur Ringkas

```
src/
├── components/     # UI (chat, layout, ui)
├── lib/            # ai/, auth/, db/, models/, r2/, rag/, tavily/, security/, utils/
├── routes/         # TanStack Router (file-based) + API routes
├── server/
│   ├── core/       # Server-only implementations (JANGAN di-import dari client)
│   └── functions/  # createServerFn RPC wrappers (client-safe)
└── styles/         # Design tokens (DESIGN.md — MindMarket cream paper)
tests/
├── unit/           # Vitest
├── integration/    # Vitest + real PostgreSQL
└── e2e/            # Playwright (12 critical paths, a11y axe, responsive 3 viewports)
```

## Arsitektur Penting

- **Server-only secrets** — `NINE_ROUTER_API_KEY`, `TAVILY_API_KEY`, `R2_*`, `DATABASE_URL` tidak pernah sampai ke browser.
- **Model Registry** — satu sumber kebenaran model & capability (`src/lib/models/registry.ts`); UI memakai internal model ID.
- **Error Taxonomy** — 19 kode `ERR-001..019` (`src/lib/utils/errors.ts`); 429 rate limit menyertakan header `Retry-After`.
- **Ownership** — setiap server function memverifikasi `getAuthSession` + `userId` sebelum akses data.

Dokumentasi lengkap: `docs/` (PRD, ARCHITECTURE, DATABASE, API, ERROR-HANDLING, SECURITY, TESTING, UI-UX, ENVIRONMENT, MILESTONES, DEFINITION-OF-DONE).
