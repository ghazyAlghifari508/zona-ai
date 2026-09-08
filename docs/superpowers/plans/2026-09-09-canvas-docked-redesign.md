# Canvas Docked Workspace & Interactive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ZonaAI Canvas into a resizable, smoothly animated docked workspace panel with browser-style tabs, compact toolbar, automatic `@mention` intent detection, interactive checklists, and native Mermaid diagram preview.

**Architecture:** Docked 3-column workspace (`Sidebar | Chat Workspace | Canvas`) where `chatPane` dynamically resizes and `GlobalNav` stays aligned with chat. Resizable divider with localStorage persistence. Unified mention system with automatic intent detection replacing manual mode toggles. Markdown renderer enhanced with interactive task-list checkboxes and responsive Mermaid SVG rendering.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, TanStack Start & Router, TanStack Query, Lucide / Hugeicons, Mermaid.js, Biome, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-canvas-docked-redesign-design.md`

## Global Constraints

- Never use `as never`, `as any`, or `@ts-ignore` in `src/`.
- No heavy shadows (`shadow-lg`, `shadow-xl`) or neon glowing borders (strict MindMarket tokens).
- Use Lucide / Hugeicons for icons (no raw emoji in UI chrome).
- Zero assumptions: verify file content and test behavior with evidence.
- Execute atomic git commits for each task with clear commit messages and push to `origin main`.

---

### Task 1: Install `mermaid` Dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: npm registry
- Produces: `mermaid` available in `package.json` and `node_modules`

- [ ] **Step 1: Install mermaid package**
Run: `bun add mermaid`

- [ ] **Step 2: Verify typecheck passes**
Run: `bun x tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit and push**
```bash
git add package.json bun.lock
git commit -m "chore: install mermaid dependency"
git push origin main
```

---

### Task 2: Automatic Mention Intent Classifier

**Files:**
- Modify: `src/lib/artifacts/mentions.ts`
- Modify: `src/server/core/chat.ts`
- Test: `tests/unit/artifact-intent.test.ts`
- Modify: `tests/unit/artifact-dispatch.test.ts`

**Interfaces:**
- Consumes: `content: string`
- Produces: `detectArtifactIntent(content: string): 'revise' | 'discuss'`
- Produces: `resolveArtifactDispatch({ content, skillId, mentions }): ArtifactDispatch`

- [ ] **Step 1: Write unit tests for intent classifier**
Create `tests/unit/artifact-intent.test.ts` testing revision intent (e.g. "tambahkan bagian accessibility", "hapus task nomor 4", "ubah database", "add section") vs discussion intent (e.g. "menurutmu bagian database sudah benar?", "apakah ini lengkap?", "jelaskan arsitekturnya").

- [ ] **Step 2: Run test to verify it fails**
Run: `bun x vitest run tests/unit/artifact-intent.test.ts`
Expected: FAIL (detectArtifactIntent not defined)

- [ ] **Step 3: Implement `detectArtifactIntent` in `src/lib/artifacts/mentions.ts`**
Add regex/word-boundary matching for revision verbs (`tambah`, `ubah`, `ganti`, `revisi`, `update`, `hapus`, `perbaiki`, `add`, `modify`, `delete`, `remove`) and questions/discussion phrases (`menurutmu`, `apakah`, `bagaimana`, `jelaskan`, `analisis`, `review`, `why`, `how`, `?`).
Update `resolveArtifactDispatch` to accept `content?: string` and use `detectArtifactIntent` when mentions are present.
In `src/server/core/chat.ts`, remove the error throwing on `m.mode === 'revise'`.

- [ ] **Step 4: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/artifact-intent.test.ts tests/unit/artifact-dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/lib/artifacts/mentions.ts ./src/server/core/chat.ts`
Expected: 0 errors

- [ ] **Step 6: Commit and push**
```bash
git add src/lib/artifacts/mentions.ts src/server/core/chat.ts tests/unit/artifact-intent.test.ts tests/unit/artifact-dispatch.test.ts
git commit -m "feat(artifacts): add automatic mention intent classifier and remove revise mode barrier"
git push origin main
```

---

### Task 3: Simplify Mention Chips (Remove Manual Mode Toggle)

**Files:**
- Modify: `src/components/artifacts/ArtifactMentionChips.tsx`
- Modify: `src/components/chat/Composer.tsx`
- Modify: `tests/unit/composer-artifact-mentions.test.tsx`
- Modify: `tests/unit/artifact-mention-state.test.ts`

**Interfaces:**
- Consumes: `mentions: readonly ArtifactMentionDraft[]`, `onRemove: (artifactId: string) => void`
- Produces: Clean mention chips without "Context" / "Revise" toggle button.

- [ ] **Step 1: Update unit tests for mention chips**
Update `tests/unit/composer-artifact-mentions.test.tsx` and `tests/unit/artifact-mention-state.test.ts` to assert that mention chips display `@title` and `v{version}` with remove button, without mode toggle button.

- [ ] **Step 2: Update `ArtifactMentionChips.tsx` and `Composer.tsx`**
Remove `onModeChange` prop and button toggle from `ArtifactMentionChips.tsx`.
Clean up `handleMentionModeChange` in `Composer.tsx`.

- [ ] **Step 3: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/composer-artifact-mentions.test.tsx tests/unit/artifact-mention-state.test.ts`
Expected: PASS

- [ ] **Step 4: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/artifacts/ArtifactMentionChips.tsx ./src/components/chat/Composer.tsx`
Expected: 0 errors

- [ ] **Step 5: Commit and push**
```bash
git add src/components/artifacts/ArtifactMentionChips.tsx src/components/chat/Composer.tsx tests/unit/composer-artifact-mentions.test.tsx tests/unit/artifact-mention-state.test.ts
git commit -m "refactor(composer): remove manual context and revise mode toggles from mention chips"
git push origin main
```

---

### Task 4: Browser-style Artifact Tabs with Embedded Close Button

**Files:**
- Modify: `src/components/artifacts/ArtifactTabs.tsx`
- Modify: `tests/unit/artifact-tabs.test.tsx`

**Interfaces:**
- Consumes: `summaries: ArtifactSummary[]`, `activeArtifactId: string | null`, `onSelectTab`, `onCloseTab`
- Produces: Integrated browser-like tab list with close `×` button inside the tab item.

- [ ] **Step 1: Update unit test for ArtifactTabs**
Check `tests/unit/artifact-tabs.test.tsx` for close button accessibility and interaction.

- [ ] **Step 2: Redesign `ArtifactTabs.tsx`**
Embed the `×` button on the right inside each tab container.
Truncate filename with `max-w-[150px]`.
Set distinct active state (`bg-pure-white shadow-xs border-hairline` or similar restrained style) and inactive hover states.
Prevent tab switch when clicking close button (`e.stopPropagation()`).

- [ ] **Step 3: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/artifact-tabs.test.tsx`
Expected: PASS

- [ ] **Step 4: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/artifacts/ArtifactTabs.tsx`
Expected: 0 errors

- [ ] **Step 5: Commit and push**
```bash
git add src/components/artifacts/ArtifactTabs.tsx tests/unit/artifact-tabs.test.tsx
git commit -m "feat(canvas): redesign tabs to browser style with embedded close button"
git push origin main
```

---

### Task 5: Compact Artifact Header Toolbar

**Files:**
- Modify: `src/components/artifacts/ArtifactHeader.tsx`
- Modify: `tests/unit/artifact-header.test.tsx`

**Interfaces:**
- Consumes: `summary`, `versions`, `activeVersionId`, `source`, `onVersionChange`, `onCopy`
- Produces: Compact single-row header with title, version selector, and icon-only Copy/Download actions.

- [ ] **Step 1: Update `ArtifactHeader.tsx`**
Replace large "Copy" and "Download" text buttons with icon-only buttons (`Copy01Icon`, `Download01Icon`) with tooltips.
Remove "Tambahkan ke context" and "Revisi di chat" buttons.
Remove redundant standalone `×` button and `artifact-close-panel` ("Close") text button.

- [ ] **Step 2: Update `tests/unit/artifact-header.test.tsx`**
Ensure tests match the icon-only buttons with `aria-label` and `data-testid` (`artifact-copy`, `artifact-download`).

- [ ] **Step 3: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/artifact-header.test.tsx`
Expected: PASS

- [ ] **Step 4: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/artifacts/ArtifactHeader.tsx`
Expected: 0 errors

- [ ] **Step 5: Commit and push**
```bash
git add src/components/artifacts/ArtifactHeader.tsx tests/unit/artifact-header.test.tsx
git commit -m "feat(canvas): compact header toolbar with icon-only actions and remove redundant buttons"
git push origin main
```

---

### Task 6: Interactive Canvas Checklist

**Files:**
- Create: `src/components/artifacts/InteractiveChecklist.tsx`
- Modify: `src/components/artifacts/ArtifactCanvas.tsx`
- Test: `tests/unit/interactive-checklist.test.tsx`

**Interfaces:**
- Consumes: `markdown: string`, `storageKey: string`, `onChange?: (updatedMarkdown: string) => void`
- Produces: Interactive checklist where checkboxes can be clicked and state is persisted.

- [ ] **Step 1: Write test for interactive checklist toggle**
Create `tests/unit/interactive-checklist.test.tsx` testing that clicking a checkbox toggles `- [ ]` to `- [x]` and updates storage.

- [ ] **Step 2: Run test to verify it fails**
Run: `bun x vitest run tests/unit/interactive-checklist.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Interactive Checklist component**
Parse markdown task lines `- [ ]` and `- [x]`.
Render custom interactive checkboxes using Lucide/Hugeicons.
Sync toggles with `setCompletedOverride` and invoke `onChange` with updated markdown.
Wire into `ArtifactCanvas.tsx` for checklist artifacts or markdown containing task lists.

- [ ] **Step 4: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/interactive-checklist.test.tsx`
Expected: PASS

- [ ] **Step 5: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/artifacts/`
Expected: 0 errors

- [ ] **Step 6: Commit and push**
```bash
git add src/components/artifacts/InteractiveChecklist.tsx src/components/artifacts/ArtifactCanvas.tsx tests/unit/interactive-checklist.test.tsx
git commit -m "feat(canvas): add interactive checklist with clickable state persistence"
git push origin main
```

---

### Task 7: Mermaid Visual Diagram Preview

**Files:**
- Create: `src/components/chat/MermaidBlock.tsx`
- Modify: `src/components/chat/MarkdownContent.tsx`
- Test: `tests/unit/mermaid-block.test.tsx`

**Interfaces:**
- Consumes: `code: string`
- Produces: Visual SVG diagram preview with responsive container, fallback on error, and preview/code toggle.

- [ ] **Step 1: Write unit test for MermaidBlock**
Create `tests/unit/mermaid-block.test.tsx` verifying it renders container and handles valid and invalid syntax safely.

- [ ] **Step 2: Run test to verify it fails**
Run: `bun x vitest run tests/unit/mermaid-block.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `MermaidBlock.tsx` and integrate with `MarkdownContent.tsx`**
Initialize mermaid with clean minimal theme (`startOnLoad: false`).
Render SVG asynchronously with error boundary / try-catch fallback.
Provide a subtle toggle between "Diagram" (default) and "Code".
In `MarkdownContent.tsx`, intercept `className="language-mermaid"` and render `<MermaidBlock code={code} />`.

- [ ] **Step 4: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/mermaid-block.test.tsx`
Expected: PASS

- [ ] **Step 5: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/chat/MermaidBlock.tsx ./src/components/chat/MarkdownContent.tsx`
Expected: 0 errors

- [ ] **Step 6: Commit and push**
```bash
git add src/components/chat/MermaidBlock.tsx src/components/chat/MarkdownContent.tsx tests/unit/mermaid-block.test.tsx
git commit -m "feat(canvas): add responsive mermaid visual preview with syntax fallback"
git push origin main
```

---

### Task 8: GlobalNav Chat-Bound Layout & Remove Padding Hack

**Files:**
- Modify: `src/components/layout/GlobalNav.tsx`
- Modify: `src/routes/chat/$conversationId.tsx`
- Modify: `src/components/artifacts/ArtifactCanvas.tsx`

**Interfaces:**
- Consumes: `user`, `authState`, `mode`, `className`
- Produces: `GlobalNav` embedded in the chat workspace header rather than floating fixed over the full viewport.

- [ ] **Step 1: Update `GlobalNav.tsx`**
Allow custom positioning / remove hardcoded `fixed top-3 right-0 z-50` when placed inside chat header, or support `embedded` mode so it stays within the chat column bounds.

- [ ] **Step 2: Embed GlobalNav in Chat Header in `chat/$conversationId.tsx`**
Place `GlobalNav` inside the sticky header of `chatPane` so it automatically resizes and moves with the chat workspace.
Remove `pt-20 md:pt-12` hack in `ArtifactCanvas.tsx` so canvas starts cleanly at `pt-0`.

- [ ] **Step 3: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/layout/GlobalNav.tsx ./src/routes/chat/$conversationId.tsx ./src/components/artifacts/ArtifactCanvas.tsx`
Expected: 0 errors

- [ ] **Step 4: Commit and push**
```bash
git add src/components/layout/GlobalNav.tsx src/routes/chat/$conversationId.tsx src/components/artifacts/ArtifactCanvas.tsx
git commit -m "refactor(layout): bind GlobalNav to chat header and eliminate canvas top padding hack"
git push origin main
```

---

### Task 9: Resizable & Animated Docked Workspace Layout

**Files:**
- Modify: `src/components/artifacts/ConversationArtifactLayout.tsx`
- Modify: `src/routes/chat/$conversationId.tsx`
- Test: `tests/unit/conversation-artifact-layout.test.tsx`

**Interfaces:**
- Consumes: `canvasOpen: boolean`, `chatPane: ReactNode`, `canvasPane: ReactNode`
- Produces: Docked flexbox layout with draggable divider (`cursor-col-resize`), smooth CSS open/close slide transitions, and localStorage width persistence.

- [ ] **Step 1: Write layout & resize unit tests**
Create or update `tests/unit/conversation-artifact-layout.test.tsx` to verify divider existence, width boundaries, and toggle state attributes.

- [ ] **Step 2: Implement Resizable Docked Layout in `ConversationArtifactLayout.tsx`**
Implement flex container:
- `chatPane` with `flex-1 min-w-0`.
- Draggable divider handle with `onPointerDown`, hover feedback (`hover:bg-notion-blue/20 cursor-col-resize`), and active drag state.
- `canvasPane` with dynamic pixel width loaded from and saved to `localStorage['zona_canvas_width']`.
- CSS transitions for width and transform when opening/closing, disabled during active dragging for 60 FPS drag performance.
- Mobile overlay/drawer fallback if screen width is narrow (<768px).

- [ ] **Step 3: Update `chat/$conversationId.tsx` and Composer integration**
Ensure automatic intent resolution is connected in `handleSend` (using `detectArtifactIntent`).
Ensure chat composer adjusts smoothly within `chatPane`.

- [ ] **Step 4: Run tests to verify they pass**
Run: `bun x vitest run tests/unit/conversation-artifact-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Run typecheck & Biome**
Run: `bun x tsc --noEmit; bun x biome check ./src/components/artifacts/ConversationArtifactLayout.tsx`
Expected: 0 errors

- [ ] **Step 6: Commit and push**
```bash
git add src/components/artifacts/ConversationArtifactLayout.tsx src/routes/chat/$conversationId.tsx tests/unit/conversation-artifact-layout.test.tsx
git commit -m "feat(layout): implement resizable docked canvas layout with smooth animations"
git push origin main
```

---

### Task 10: End-to-end Integration, Polish, & Full Suite Verification

**Files:**
- Modify: any affected files/tests

**Interfaces:**
- Consumes: Entire codebase
- Produces: All unit, integration, typecheck, and lint suites passing cleanly with zero type-bypass violations.

- [ ] **Step 1: Run bypass scan**
Run: `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src -g '!routeTree.gen.ts'`
Expected: 0 matches in modified files.

- [ ] **Step 2: Run typecheck**
Run: `bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run Biome linter & formatter**
Run: `bun x biome check ./src`
Expected: 0 issues.

- [ ] **Step 4: Run Vitest test suite**
Run: `bun x vitest run`
Expected: ALL PASS.

- [ ] **Step 5: Final commit and push**
```bash
git add -A
git commit -m "chore: final verification and polish for docked canvas workspace redesign"
git push origin main
```
