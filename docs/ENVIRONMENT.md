# Environment Variables Specification

This document details the environment variables required for the Zona.ai application.

## Categories and Variables

### DATABASE

*   **`DATABASE_URL`**
    *   **Purpose:** PostgreSQL connection string for the database.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments (Dev: local PostgreSQL, Prod: Neon connection string)
    *   **Expected Format:** `postgresql://user:password@host:port/database`
    *   **Example Value:** `postgresql://zona:password@localhost:5432/zona_ai`

### AUTH (Better Auth)

*   **`BETTER_AUTH_SECRET`**
    *   **Purpose:** Secret key for Better Auth session signing.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** Random string, minimum 32 characters
    *   **Example Value:** `your-secret-key-min-32-chars-here-change-me`

*   **`BETTER_AUTH_URL`**
    *   **Purpose:** Application base URL for auth callbacks.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** Full URL
    *   **Example Value:** `http://localhost:3000`

*   **`GOOGLE_CLIENT_ID`**
    *   **Purpose:** Google OAuth Client ID for Better Auth social sign-in.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** `*.apps.googleusercontent.com`
    *   **Example Value:** `your-google-client-id.apps.googleusercontent.com`

*   **`GOOGLE_CLIENT_SECRET`**
    *   **Purpose:** Google OAuth Client Secret for server-side token exchange.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** Secret string
    *   **Example Value:** `GOCSPX-your-google-client-secret`

### 9ROUTER (AI Gateway)

*   **`NINE_ROUTER_BASE_URL`**
    *   **Purpose:** 9Router API base URL.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** URL ending with `/v1`
    *   **Example Value:** `http://localhost:20128/v1`

*   **`NINE_ROUTER_API_KEY`**
    *   **Purpose:** API key for 9Router authentication.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** API key string
    *   **Example Value:** `your-9router-api-key`

### R2 (Cloudflare R2 Object Storage)

*   **`R2_ACCOUNT_ID`**
    *   **Purpose:** Cloudflare account ID.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** String
    *   **Example Value:** `your-cloudflare-account-id`

*   **`R2_ACCESS_KEY_ID`**
    *   **Purpose:** R2 access key.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** String
    *   **Example Value:** `your-r2-access-key-id`

*   **`R2_SECRET_ACCESS_KEY`**
    *   **Purpose:** R2 secret key.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** String
    *   **Example Value:** `your-r2-secret-access-key`

*   **`R2_BUCKET_NAME`**
    *   **Purpose:** R2 bucket name.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** String
    *   **Example Value:** `zona-ai-files`

*   **`R2_PUBLIC_URL`**
    *   **Purpose:** R2 public URL (if bucket is public, otherwise served via server).
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional
    *   **Environments:** All environments
    *   **Expected Format:** URL string
    *   **Example Value:** `https://files.zona.ai`

### TAVILY (Web Search)

*   **`TAVILY_API_KEY`**
    *   **Purpose:** Tavily API key for web search.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** `tvly-...`
    *   **Example Value:** `tvly-your-tavily-api-key`

### EXA (Advanced Research â€” Future)

*   **`EXA_API_KEY`**
    *   **Purpose:** Exa API key for advanced research (Future MVP).
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional (not needed for MVP)
    *   **Environments:** All environments
    *   **Expected Format:** API key string
    *   **Example Value:** `your-exa-api-key`

### LANGFUSE (AI Observability)

*   **`LANGFUSE_SECRET_KEY`**
    *   **Purpose:** Langfuse secret key for observability.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required for observability, Optional for MVP dev
    *   **Environments:** All environments
    *   **Expected Format:** `sk-lf-...`
    *   **Example Value:** `sk-lf-your-langfuse-secret-key`

*   **`LANGFUSE_PUBLIC_KEY`**
    *   **Purpose:** Langfuse public key for observability.
    *   **Server/Client:** Server-only
    *   **Requirement:** Required for observability
    *   **Environments:** All environments
    *   **Expected Format:** `pk-lf-...`
    *   **Example Value:** `pk-lf-your-langfuse-public-key`

*   **`LANGFUSE_BASE_URL`**
    *   **Purpose:** Langfuse server URL.
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional (defaults to cloud.langfuse.com)
    *   **Environments:** All environments
    *   **Expected Format:** URL string
    *   **Example Value:** `https://cloud.langfuse.com`

### APP (Application)

*   **`APP_URL`**
    *   **Purpose:** Application base URL.
    *   **Server/Client:** Shared (SSR)
    *   **Requirement:** Required
    *   **Environments:** All environments
    *   **Expected Format:** URL string
    *   **Example Value:** `http://localhost:3000`

*   **`NODE_ENV`**
    *   **Purpose:** Environment mode.
    *   **Server/Client:** Shared
    *   **Requirement:** Required (Auto-set by runtime)
    *   **Environments:** All environments
    *   **Expected Format:** Enum (`development`, `production`, `test`)
    *   **Example Value:** `development`

### RATE LIMITING (Fase 10 Hardening)

*   **`RATE_LIMIT_CHAT_PER_MINUTE`**
    *   **Purpose:** Max single-chat generations per user per minute (in-memory).
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional (default 20)
    *   **Environments:** All environments
    *   **Expected Format:** Integer
    *   **Example Value:** `20`

*   **`RATE_LIMIT_COMPARE_PER_MINUTE`**
    *   **Purpose:** Max compare runs per user per minute (in-memory).
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional (default 20)
    *   **Environments:** All environments
    *   **Expected Format:** Integer
    *   **Example Value:** `20`

*   **`RATE_LIMIT_UPLOAD_PER_MINUTE`**
    *   **Purpose:** Max file uploads per user per minute (in-memory).
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional (default 10)
    *   **Environments:** All environments
    *   **Expected Format:** Integer
    *   **Example Value:** `10`

*   **`RATE_LIMIT_SEARCH_PER_MINUTE`**
    *   **Purpose:** Max web-search calls per user per minute (in-memory).
    *   **Server/Client:** Server-only
    *   **Requirement:** Optional (default 30)
    *   **Environments:** All environments
    *   **Expected Format:** Integer
    *   **Example Value:** `30`

> Implementation: `src/lib/security/rate-limit.ts` — in-memory `Map` per user/IP.
> Exceeding a limit returns HTTP 429 `ERR-017` with a `Retry-After` header (seconds).
> TODO Redis: replace with Redis INCR + EXPIRE for multi-instance deployments.

### RAG / FILE / EMBEDDING (Fase 06-08, direview Fase 10)

*   **`MAX_FILE_SIZE_BYTES`** — Batas ukuran upload per file. Server-only. Optional (default `10485760` = 10MB). 413 `ERR-012` bila terlampaui.
*   **`R2_BUCKET_NAME`** — Nama bucket Cloudflare R2. Server-only. Required.
*   **`EMBEDDING_DIMENSION`** — Dimensi vektor embedding pgvector. Server-only. Optional (default `1536`).
*   **`RAG_CHUNK_SIZE`** — Panjang karakter per chunk dokumen. Server-only. Optional (default `1000`).
*   **`RAG_CHUNK_OVERLAP`** — Overlap antar chunk. Server-only. Optional (default `200`).
*   **`RAG_TOP_K`** — Jumlah chunk yang diretrieval per query. Server-only. Optional (default `5`).
*   **`TAVILY_MAX_RESULTS`** — Jumlah hasil web search Tavily. Server-only. Optional (default `5`).
*   **`TAVILY_TIMEOUT_MS`** — Timeout request Tavily (ms). Server-only. Optional (default `10000`).
