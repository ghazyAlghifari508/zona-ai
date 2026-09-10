# Zona.ai

> **The Restrained Multi-Model AI Evaluation & Reasoning Workspace**

Zona.ai is an editorial, high-performance workspace designed for rigorous side-by-side AI model comparison, grounded retrieval, and artifact collaboration. Instead of locking workflows into a single model's walled garden, Zona.ai empowers developers, researchers, and creators to query multiple frontier models simultaneously, evaluate outputs under identical deterministic conditions, and work with living artifacts in a calm, distraction-free environment.

---

## Executive Overview

Modern frontier language models diverge substantially in reasoning depth, code generation idiomaticity, creative voice, and factual accuracy. Evaluating these differences through fragmented browser tabs or biased single-model interfaces leads to incomplete conclusions, hidden hallucinations, and inefficient prompt iteration.

Zona.ai bridges this gap with a unified multi-model canvas. Users can query individual models or execute **Compare Mode**, dispatching a single prompt simultaneously across frontier models (such as GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, DeepSeek V3, and Llama 3) with synchronized context, shared search retrieval, and zero synthetic latency.

---

## The Problem: The Single-Model Blindspot

When developers or knowledge workers rely on a single default assistant:
- **Blind Faith in Hallucinations**: Subtle logical fallacies and hallucinated package methods pass undetected without immediate counter-verification.
- **Provider Lock-in & Bias**: Different architectures excel at distinct tasks (e.g., Anthropic models in code refactoring, OpenAI models in instruction following, Google models in massive context retrieval). Relying on one model restricts problem-solving agility.
- **Fragmented Copy-Paste Overhead**: Testing the same prompt across four separate model subscriptions requires manual copy-pasting, inconsistent context windows, duplicate file uploads, and fragmented conversation histories.
- **Inflated Subscription Costs**: Maintaining individual Pro/Plus subscriptions across multiple AI platforms quickly escalates monthly SaaS expenses.

---

## Core Philosophy: Radical Fairness & Determinism

Benchmarking AI models in real-world workflows requires strict scientific control. Zona.ai enforces three non-negotiable principles of radical fairness:

1. **Deterministic Input Parity**: Every model in a comparison run receives the exact same system instructions, the exact same prompt wording, and the exact same conversation history. There are no hidden provider-specific prompt boosts or asymmetric penalties.
2. **Unified External Context**: When Web Search or Document RAG is triggered, external sources are fetched once and shared identically across all active models. No model gets privileged or disparate search results.
3. **Pure Signal Fidelity**: Zona.ai never simulates fake thinking phases, synthetic token pacing, or fabricated status delays. What you see is the true raw transmission from the inference engine.

---

## Compare Mode: Orchestration & Multi-Model Workflow

Compare Mode is the core innovation of Zona.ai. Rather than sending individual requests sequentially, the engine orchestrates simultaneous multi-model execution:

- **2 to 4 Models in Side-by-Side Grid**: Select any combination of active models directly from the composer header. Compare lightweight models against heavy reasoning models, or test competing frontier LLMs head-to-head.
- **Synchronized Generation Run**: Submitting a prompt generates a top-level comparison run linked to individual generation child entities in PostgreSQL.
- **Side-by-Side Responsive Layout**: Responses render in parallel columns with synchronized scroll tracking, allowing instant visual diffing between code blocks, explanations, and architectural proposals.
- **One-Click Best Response Selection**: Mark any response as the winning output, pinning that model's context as the canonical path for subsequent follow-up turns if desired.
