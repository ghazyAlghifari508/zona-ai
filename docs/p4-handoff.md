# P4 handoff

## Catalog state

Version `p3-catalog-v2` is live. Active scope is virtual `auto` plus 17 physical routes. `model_catalog` holds 40 rows; 22 retired routes remain resolvable for chat history through `model_settings.status = 'retired'` and inactive flags. Atria is retired. The two DeepSeek routes stay separate. No manual catalog SQL writes were used.

| Route | Label | Status | Score | Bars | Credits | Vision |
|---|---|---|---:|---:|---:|---|
| `gh/gpt-4.1` | existing | retained/legacy | 60 | 2 | 3 | supported |
| `gh/gpt-4o` | existing | retained/legacy | 57.5 | 2 | 3 | unsupported |
| `ag/gemini-3.8-flash-high` | existing | retained/legacy | 100 | 4 | 15 | supported |
| `nous/tencent/hy4-flash:free` | HY4 Flash | verified/active | 98.33 | 4 | 15 | unverified |
| `cor-prod/deepseek-v4-1-flash-1017` | DeepSeek V4.1 Flash | verified/active | 90 | 4 | 15 | unverified |
| `cent-ai/qwen3.8-flash` | Qwen 3.8 Flash | verified/active | 85 | 3 | 6 | unverified |
| `ic-prod/mercury-3` | Mercury 3 | verified/active | 90 | 4 | 15 | unverified |
| `zro-prod/zro/deepseek-v4.1-flash` | DeepSeek V4.1 Flash | verified/active | 73.33 | 3 | 6 | supported |
| `nvidia/minimaxai/minimax-m3.1-flash` | MiniMax M3.1 Flash | verified/active | 90.83 | 4 | 15 | supported |
| `cx/gpt-6.2-sol` | GPT 6.2 Sol | verified/active | 98.33 | 4 | 15 | supported |
| `cx/gpt-6.1-sol` | GPT 6.1 Sol | verified/active | 98.33 | 4 | 15 | supported |
| `cx/gpt-6.1-terra` | GPT 6.1 Terra | verified/active | 93.33 | 4 | 15 | supported |
| `cx/gpt-6-luna` | GPT 6 Luna | verified/active | 90 | 4 | 15 | unverified |
| `gcli/grok-4.7` | Grok 4.7 | verified/active | 78.33 | 3 | 6 | unverified |
| `cc/claude-opus-5-5` | Claude Opus 5.5 | verified/active | 95.56 | 4 | 15 | supported |
| `cc/claude-sonnet-5-5` | Claude Sonnet 5.5 | verified/active | 88.33 | 4 | 15 | supported |
| `tokenharbor/mimo-v2.6-flash:free` | MiMo V2.6 Flash | verified/active | 53.89 | 2 | 3 | supported |

`auto` stays virtual with adaptive credits. Its router has no benchmark row and is not compared.

## Credit semantics

Bars 2/3/4 map to 3/6/15 credits through `CREDIT_COST_BY_BARS`. Score thresholds stay at 65/85 for bars 3/4. Retained routes keep legacy calibration; no tariff or threshold changed in P3. Unknown capabilities remain disabled.

## Vision

`supported`: primary image fixtures answered correctly. `unsupported`: gateway rejected image media type. `unverified`: fixture answers were wrong. All three pass the evidence validator; `inconclusive` and `not-tested` fail. `gh/gpt-4o` is the only unsupported route. Rejections are classified from the gateway response body, not from a generic HTTP 400.

## Evidence

Final checkpoint: `test-results/p3/p3-final-v1/` (`report.json`, `report.md`, `report.csv`, `provenance.json`, `attempts.jsonl`). Suite hash `766b2f91eaa0f260f6807dcdf8354eb1dd9c9fbed71862075724807ce75ea5ef`. 1,960 calls for 1,717 planned cases, zero blockers. `p3-final-v1` combines the audited `p3-full-v2` journal with the grok-only `p3-grok-v1` re-run at 120 seconds; grok needs ~50 seconds and its bare upstream ID is accepted only with gateway provenance. Evidence rows stay append-only and are validated per fixture hash, timestamp, route, provenance-verified identity, and response body.

Source checkpoints `p3-full-v2`, `p3-grok-v1`, and `p3-full-v4` remain local and uncommitted. `p3-full-v4` is diagnostic only: its 30-second-era comparison showed rate-limit and timeout gaps and was not used for publication.

## P4 scope and blockers

P4 owns the UI work against the live catalog: model selector grouping, search, compare, admin model view, and composer draft preservation. No P3 blocker remains. The full unit suite previously showed failures in those UI suites (`composer-draft-preservation`, `model-selector-grouping`, `model-selector-search`, `admin-models-view`, `message-list-virtual`, `admin-navigation`, `sidebar`); they are outside P3 evidence and must be handled in P4. P9 owns browser QA: chat single, credits, compare, model selection, and image attachment against the cut-over catalog.

## Verification and commits

P3 gates passed: `bun x tsc --noEmit`, `bun x biome check ./src` (209 files), and focused Vitest for provenance, gateway, evidence, runner, and Vision (24 tests). The full unit suite was not green; failures above are pre-existing UI tests.

Key commits: `13575e1` provenance, `c2d58fb` gateway integration, `9e7d7de` bootstrap doc, `984612b` Vision rejection classification, `c90702b` recheck, `c023ba3` route-scoped recheck, `1015c8a` status doc, `32b3041` provenance-alias evidence validator.
