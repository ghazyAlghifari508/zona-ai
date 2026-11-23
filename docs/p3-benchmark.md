# P3 benchmark and cutover

**Status: IN PROGRESS on full-suite evidence.** Manifest `p3-catalog-v2` targets 17 physical routes plus virtual Auto. Atria is in the 22-route retirement set with history preserved. Gateway provenance verified all 17 exact routes from read-only usage correlation. Full suite `p3-full-v2` completed 1,940 calls but remained BLOCKED: 30-second streams timed out on several models, and image media-type rejections were initially misclassified. A TDD fix now classifies those rejections as `image-unsupported`, and an audited `--recheck` pass raised 15 of 17 routes to review-required. The two remaining routes timed out at 30 seconds; one needed ~50 seconds plus gateway provenance to accept its bare model ID. Rerun `p3-full-v4` uses a 120-second timeout. No catalog cutover has run.

## Reproduce

From the repository root with Bun and the existing server-side 9Router configuration:

```bash
bun src/server/core/p3-benchmark.ts --run p3-discovery --discover
bun src/server/core/p3-benchmark.ts --run p3-discovery --resume --discover
```

Without `--live`, the runner sends no inference. After approval, add `--live --max-calls N --max-tokens N` using the approved cumulative caps. Run `--stage preflight`, then `--stage pilot --resume`, then `--stage full --resume`. Use repeated `--route <exact-id>` flags for any subset or a future model, with a distinct `--run` name for each route list. Keep the same `--seed`, `--max-output`, and `--timeout` when resuming. `--deadline` is the wall-clock run limit in milliseconds; `--concurrency`, `--retries`, `--global-gap`, and `--provider-gap` bound requests. Exit 2 means blocked live coverage; exit 1 means invalid configuration or failed checkpoint. No fallback route is requested. An interrupted reservation still counts against both caps.


`--recheck` re-evaluates jobs whose latest journal state is a final invalid state (`http-rejected`, `aborted`, `identity-mismatch`, and related transport outcomes); it never rechecks `valid` or `auth`. Repeat `--recheck-route <exact-id>` limits that pass to selected routes without changing the frozen route list. Each rechecked job gets a fresh reservation and a new append-only row; prior rows stay in the journal.

Live runner v2 uses the same resolver while each request completes. An alias reported on the wire becomes a valid exact-route result only when the gateway usage row resolves that route; otherwise it stays `identity-mismatch`. Failed resolver lookups do not weaken the gate.

`test-results/p3/<run>/` contains the frozen manifest, append-only attempt journal, JSON/CSV/Markdown reports, and `provenance.json` with correlated gateway rows. Keep this directory private and outside commits. Output and input reservation is a planning bound, not a verified billing measure. A matching response model alone is not proof; gateway-reported provenance is the evidence used for exact-route verification and is still not independent upstream attestation.

Suite `zona-p3-v1`: 60 text cases per model (15/15/9/9/6/6), 24 additional text calls, 8 PNG cases, 4 visual repeats, 4 no-image controls, 1 preflight. No tools, shared transcript, or user data. Coding uses static checkable answers, not executable model code. Category scores weight each case equally; overall score weights categories by case count. Reports display two decimals; tier thresholds use raw scores (65/85), and catalog score is rounded to an integer. Credits are 3/6/15 from `CREDIT_COST_BY_BARS`. Retained calibration flags floor/ceiling or a range below five points; no threshold changes without approval. Repetition mean/range/agreement measure instability, not universal intelligence. Methods: [OpenAI eval practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [Lighteval](https://huggingface.co/docs/lighteval/), [image input](https://developers.openai.com/api/docs/guides/images-vision).

## Discovery evidence

Discovery-only snapshot: `2026-11-23T03:08:44.876Z`; suite hash `d6ff39f7e6031f60827da37ee81b040f5c86b9a42d98a7d1b1dd89c15db490d5`. 0/1,818 planned calls; default total reservation 9,147,582 tokens before retries. Actual provider tokens/cost unknown. All routes: 0/60 valid, category/aggregate/bars/credit unknown, Vision not-tested, status BLOCKED.

| Exact route | Discovery | Connectivity | Scope |
|---|---|---|---|
| `gh/gpt-4.1` | listed | not-tested | retained |
| `gh/gpt-4o` | listed | not-tested | retained |
| `ag/gemini-3.8-flash-high` | listed | not-tested | retained |
| `atria/Atria-Dawn-Preview` | not listed | not-tested | retained |
| `nous/tencent/hy4-flash:free` | listed | not-tested | new |
| `cor-prod/deepseek-v4-1-flash-1017` | listed | not-tested | new |
| `cent-ai/qwen3.8-flash` | listed | not-tested | new |
| `ic-prod/mercury-3` | listed | not-tested | new |
| `zro-prod/zro/deepseek-v4.1-flash` | listed | not-tested | new |
| `nvidia/minimaxai/minimax-m3.1-flash` | listed | not-tested | new |
| `cx/gpt-6.2-sol` | listed | not-tested | new |
| `cx/gpt-6.1-sol` | listed | not-tested | new |
| `cx/gpt-6.1-terra` | listed | not-tested | new |
| `cx/gpt-6-luna` | listed | not-tested | new |
| `gcli/grok-4.7` | listed | not-tested | new |
| `cc/claude-opus-5-5` | listed | not-tested | new |
| `cc/claude-sonnet-5-5` | listed | not-tested | new |
| `tokenharbor/mimo-v2.6-flash:free` | listed | not-tested | new |

### Live preflight

Run `p3-preflight-v2-usd1` completed at `2026-11-23T09:12:08.858Z`, manifest hash `5882a65401d7bb522e389914ec2027c2bf35285885768676beb723d117de065d`. The checkpoint name predates the authorization to run preflight with unknown USD cost. Discovery had listed all 17 targets. The runner made 17 requests with no retries, reserved 15,028 tokens, and observed 5,569 reported tokens across five calls. The other 12 did not report usage to the runner. Cost remains unknown. Exit 2 indicates missing full-suite coverage; no text benchmark, repeats, or Vision cases ran.

| Exact route | Preflight outcome | Reported model | Latency (ms) |
|---|---|---|---:|
| `gh/gpt-4.1` | SDK rejected response (HTTP 200) | unknown | 1655 |
| `gh/gpt-4o` | SDK rejected response (HTTP 200) | unknown | 1189 |
| `ag/gemini-3.8-flash-high` | SDK rejected response (HTTP 200) | unknown | 4322 |
| `nous/tencent/hy4-flash:free` | SDK rejected response (HTTP 200) | unknown | 4397 |
| `cor-prod/deepseek-v4-1-flash-1017` | SDK rejected response (HTTP 200) | unknown | 971 |
| `cent-ai/qwen3.8-flash` | SDK rejected response (HTTP 200) | unknown | 2250 |
| `ic-prod/mercury-3` | SDK rejected response (HTTP 200) | unknown | 861 |
| `zro-prod/zro/deepseek-v4.1-flash` | SDK rejected response (HTTP 200) | unknown | 1973 |
| `nvidia/minimaxai/minimax-m3.1-flash` | SDK rejected response (HTTP 200) | unknown | 1509 |
| `cx/gpt-6.2-sol` | Correct answer; identity mismatch | `gpt-6.2-sol` | 1750 |
| `cx/gpt-6.1-sol` | Correct answer; identity mismatch | `gpt-6.1-sol` | 1706 |
| `cx/gpt-6.1-terra` | Correct answer; identity mismatch | `gpt-6.1-terra` | 1846 |
| `cx/gpt-6-luna` | Correct answer; identity mismatch | `gpt-6-luna` | 2585 |
| `gcli/grok-4.7` | Correct answer; identity mismatch | `grok-4.7` | 19355 |
| `cc/claude-opus-5-5` | SDK rejected response (HTTP 200) | unknown | 1730 |
| `cc/claude-sonnet-5-5` | SDK rejected response (HTTP 200) | unknown | 1360 |
| `tokenharbor/mimo-v2.6-flash:free` | SDK rejected response (HTTP 200) | unknown | 12060 |

The five correct answers returned bare model IDs, not the requested exact routes. The other responses were recorded as `http-rejected` with status 200; the journal did not retain their body, so the cause is unknown. Request IDs were recorded for five calls; none reported a gateway version. Inspect gateway logs for the rejected responses and verify the bare ID mapping before requesting approval for any additional inference.

Read-only 9Router log correlation: in the preflight window, eight usage records matched the application key and target model names. Four were logged under `codex`, one under `grok-cli`, one under `antigravity`, and two under `claude`. This supports the provider mapping for the five bare IDs, but the usage records do not tie individual runner request IDs to gateway responses. For three SDK-rejected responses, 9Router logged successful upstream usage. No request detail rows were retained in that window, so the response parsing failure remains undiagnosed. No inference was repeated.

Executed command (historical; do not rerun without separate authorization):

```bash
bun src/server/core/p3-benchmark.ts --run p3-preflight-v2-usd1 --stage preflight --retries 0 --concurrency 1 --max-calls 17 --max-tokens 18000 --max-output 512 --timeout 20000 --deadline 420000 --resume --live
```

Two additional diagnostic calls ran without retry. `gh/gpt-4.1` returned HTTP 200 with `Content-Type: text/event-stream` and a non-JSON body to the non-streaming SDK request. This explains the SDK rejection for this probe only. `cx/gpt-6.2-sol` returned valid JSON with a bare model ID again, so exact-route provenance remains unverified. Sanitized wire metadata is local at `test-results/p3/diagnostics-two/`. No full-suite cases ran. The two probes reported 781 tokens for one call; remaining usage and USD cost are unknown.

### Streaming preflight (runner v2)

Run `p3-stream-check` completed at `2026-11-23T14:33:03.650Z`, manifest hash `f1aecb056fcab08bf18af216bbb2263618b097e12021e4ce1a856333bd197cee`. Discovery listed 17/17 targets. Exactly 17 inference requests ran, with zero retries. Fifteen streams finished and two hit the 20-second timeout. The reported model IDs are upstream aliases, not exact routes. A read-only enrichment pass at `2026-11-23T14:51:48.747Z` correlated all 15 completions one-to-one with gateway usage rows. Each correlated row resolved the same model as the requested route after the first slash, with status `ok`. Those 15 routes are exact-route verified. `cent-ai/qwen3.8-flash` and `gcli/grok-4.7` remain inconclusive.

| Requested route | Reported model ID | Gateway resolved model | Stream outcome | Latency (ms) |
|---|---|---|---|---:|
| `gh/gpt-4.1` | `gpt-4.1-2025-04-14` | `gpt-4.1` (github) | Verified | 1657 |
| `gh/gpt-4o` | `gpt-4o-2024-11-20` | `gpt-4o` (github) | Verified | 1042 |
| `ag/gemini-3.8-flash-high` | `gemini-3.8-flash-n` | `gemini-3.8-flash-high` (antigravity) | Verified | 3553 |
| `nous/tencent/hy4-flash:free` | `tencent/hy4-flash:free` | `tencent/hy4-flash:free` (nous) | Verified | 3380 |
| `cor-prod/deepseek-v4-1-flash-1017` | `deepseek-v4-1-flash-1017` | `deepseek-v4-1-flash-1017` (custom provider) | Verified | 1083 |
| `cent-ai/qwen3.8-flash` | Unknown | None | Timeout, inconclusive | 20028 |
| `ic-prod/mercury-3` | `mercury-3` | `mercury-3` (custom provider) | Verified | 1050 |
| `zro-prod/zro/deepseek-v4.1-flash` | `zro/deepseek-v4.1-flash` | `zro/deepseek-v4.1-flash` (custom provider) | Verified | 1418 |
| `nvidia/minimaxai/minimax-m3.1-flash` | `minimaxai/minimax-m3.1-flash` | `minimaxai/minimax-m3.1-flash` (nvidia) | Verified | 16051 |
| `cx/gpt-6.2-sol` | `gpt-6.2-sol` | `gpt-6.2-sol` (codex) | Verified | 1655 |
| `cx/gpt-6.1-sol` | `gpt-6.1-sol` | `gpt-6.1-sol` (codex) | Verified | 1509 |
| `cx/gpt-6.1-terra` | `gpt-6.1-terra` | `gpt-6.1-terra` (codex) | Verified | 2648 |
| `cx/gpt-6-luna` | `gpt-6-luna` | `gpt-6-luna` (codex) | Verified | 2569 |
| `gcli/grok-4.7` | Unknown | None | Timeout, inconclusive | 20021 |
| `cc/claude-opus-5-5` | `claude-opus-5-5` | `claude-opus-5-5` (claude) | Verified | 1010 |
| `cc/claude-sonnet-5-5` | `claude-sonnet-5-5` | `claude-sonnet-5-5` (claude) | Verified | 2596 |
| `tokenharbor/mimo-v2.6-flash:free` | `mimo-v2.6-flash` | `mimo-v2.6-flash:free` (tokenharbor) | Verified | 9296 |

The gateway reported 43,474 tokens across 15 calls, above the 15,028-token reservation. Two calls reported no usage. Reservation is not a bound on actual provider tokens. The 15 correlated gateway rows reported a combined cost of $0.02788696; no cost was null. No request-detail rows were retained, so request IDs cannot be matched to routing records. Exact-route verification rests on the correlated usage rows, not on those IDs. Raw evidence and JSON/CSV/Markdown reports are local at `test-results/p3/p3-stream-check/` and excluded from Git. Exit 2 indicates incomplete full-suite coverage. No pilot, text benchmark, Vision cases, or cutover ran.

## Admin and P4 handoff

Use the authenticated operations in `src/server/functions/admin-models.ts`: `stageP3CatalogFn` imports new pending entries, `publishAdminModelFn({data:{modelId,run}})` validates the trusted server checkpoint, and `cutoverP3CatalogFn({data:'p3-catalog-v2'})` retires only the manifest set in one transaction. Keep the report directory writable only by trusted operators; never accept report uploads. Pending entries are not selectable. Publication derives scores and prices from evidence, preserves inactive state, and is idempotent for the same evidence. Review prior prices in the audit metadata. Unknown capabilities stay disabled. Keep the two new DeepSeek routes separate; the old DeepSeek route and Atria remain resolvable for history after retirement.

Production bootstrap before cutover: the database was at migration 17 of 20, without `model_catalog` or `model_aliases`. `bun x drizzle-kit migrate` applied migrations 0017–0019, bringing it to 20. `seedModelCatalogFromLegacy(db)` then inserted 26 catalog rows and 2 aliases from the P1 legacy seed, including `auto` and all three retained routes. Read-only scope check before staging: 26 rows, 14 missing (the added manifest set), 22 drift (the retirement set), 0 conflicts. No manual SQL writes were used for catalog data.

```mermaid
flowchart TD
  A[Exact route pending import] --> B[Preflight and pilot]
  B -->|Insufficient evidence| C[Blocked, preserve checkpoint]
  B --> D[Text cases and repeats]
  B --> E[Vision fixtures and controls]
  D --> F[Server validation and credit derivation]
  E --> F
  F -->|Verified and safe| G[Publish and check Auto plus title]
  G --> H[Retire exact manifest and assert final scope]
```

Do not start P4 before live evidence, isolated PostgreSQL, and cutover gates pass. Labels and lifecycle targets are in `src/lib/models/p3-manifest.ts`; live Vision/credit remain unknown. P9 browser QA: rerun chat single, credits, compare, model selection and image attachment journeys against the cut-over catalog.

Implementation commits: `ba34b19` (manifest), `6b6d4a0` (text scoring), `b53f5f7` (runner), `bbcf505` (Vision gate), `0c89591` (evidence and cutover), `eb16b27` (regressions).

Verification (each exit 0): `bun x tsc --noEmit`; `bun x biome check ./src` (207 files); `bun run build` (46s); focused Vitest (66 passed, 7.6s); isolated PostgreSQL admin/catalog (28 passed, 9.7s); isolated chat/compare/artifact and selector (50 passed, 26.4s); final SDK transport integration (2 passed, 0.81s). The initial runtime suite failed on missing `model_catalog`; rerunning against migrated isolated PostgreSQL exposed stale suffix IDs in compare fixtures. Those fixtures now use exact IDs without changing coverage or credit expectations. Synthetic test output is not live evidence.
