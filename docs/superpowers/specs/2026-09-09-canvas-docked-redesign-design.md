# Architecture Design Spec: ZonaAI Canvas Docked Workspace & Interactive Redesign

**Date:** 2026-09-09  
**Status:** Approved for Implementation  
**Target:** ZonaAI Web App (`/chat/$conversationId`)

---

## 1. Executive Summary

Transform the Canvas in ZonaAI from an uncoordinated panel into a first-class **Docked Workspace Panel**:
1. **Docked Workspace Layout**: `Sidebar | Chat Workspace | Canvas` where chat and top navigation smoothly compress when canvas opens, and expand when closed.
2. **Smooth Slide Animations**: CSS transition when opening and closing canvas without disrupting message virtualization or composer positioning.
3. **Resizable Panel Divider**: Draggable handle between Chat and Canvas with mouse/touch drag, boundary limits (min 360px, max 65% width), and localStorage persistence (`zona_canvas_width`).
4. **Unified Close & Browser Tabs**: Tab pattern `[ Title ... × ]` with the close button inside the tab. Remove all redundant "Close" buttons.
5. **No Context/Revise Mode**: Remove manual mode selection. Mentioning files via `@` in composer automatically detects intent (revision/modification vs. question/discussion).
6. **Compact Toolbar**: Icon-only Copy and Download buttons with tooltips.
7. **Interactive Checklist**: Checkboxes in Canvas can be clicked, toggling task completion and persisting state.
8. **Mermaid Rendering**: Fenced `mermaid` blocks render as responsive visual diagrams with robust syntax error fallbacks.

---

## 2. Layout & Shell Architecture

### 2.1 Problem in Current Implementation
`GlobalNav.tsx` uses `fixed top-3 right-0 z-50`. When the canvas opened on the right side of the screen, the fixed navigation bar sat directly on top of the canvas header. To compensate, `ArtifactCanvas.tsx` added `pt-20 md:pt-12` padding, creating awkward whitespace and visual overlap.

### 2.2 Solution
- **GlobalNav Containment**: In app mode on chat routes, `GlobalNav` is positioned within the header of `chatPane` (or constrained to the chat column's width), so its elements (Reset Kredit, FAQ, Bantuan, Upgrade, Profile) slide and adjust along with the chat area.
- **Top of Canvas is Clean**: The top of the canvas is now dedicated exclusively to its own Tab Bar and compact header, with zero artificial top padding (`pt-0`).
- **Composer Stability**: Composer remains anchored at the bottom of `chatPane`, automatically adjusting its centered max-width to the narrower chat column when the canvas opens.

```
+---------+-----------------------------------+-----------------------------+
| Sidebar | Chat Workspace                    | Canvas (Docked)             |
|         | [Top: Compare info   GlobalNav]   | [Tabs: Doc 1 × | Doc 2 × ]  |
|         |                                   | [Header: Title v1 | (cp)(dl)]|
|         | Messages                          | Content:                    |
|         |                                   | - Interactive Checklist     |
|         |                                   | - Mermaid SVG Preview       |
|         |                                   | - Formatted Markdown        |
|         | [Bottom: Composer               ] |                             |
+---------+-----------------------------------+-----------------------------+
                                              <-- Draggable Divider -->
```

---

## 3. Resizable Divider & Smooth Transition

### 3.1 State & Persistence
- Default width: `520px` (or 45% of viewport width if screen is small).
- Minimum width: `360px`; Maximum width: `calc(100vw - 420px)` (ensuring chat has at least ~420px).
- Persisted in `localStorage.getItem('zona_canvas_width')`.

### 3.2 Drag Behavior
- `onPointerDown` on the divider sets an active dragging state.
- During drag: disable CSS transition (`transition-none`) for 60 FPS performance, attach global `pointermove` and `pointerup` handlers.
- End of drag: persist new width to localStorage.

### 3.3 Slide Animation
- Opening: Canvas animates width from `0` to `targetWidth` with `transition-[width] duration-200 ease-out`.
- Closing: Canvas animates width to `0` and unmounts/hides cleanly.

---

## 4. Simplified Tabs & Compact Header

### 4.1 Browser-style Tab Design
- Pattern:
  ```tsx
  <div role="tab" className="flex items-center gap-1.5 ...">
    <span className="truncate max-w-[160px]">{summary.title}</span>
    <button aria-label="Close tab" onClick={...}>×</button>
  </div>
  ```
- Active tab has distinct background (`bg-pure-white` or `bg-paper`) and indicator.
- Closing the last tab automatically collapses the canvas panel.

### 4.2 Compact Header Actions
- Title and Version select dropdown on the left.
- Right actions:
  - Copy button: icon-only (`Copy01Icon`), tooltip "Salin isi", copy feedback state.
  - Download button: icon-only (`Download01Icon`), tooltip "Unduh file".
- Removed:
  - Redundant "Close" text button.
  - Redundant secondary `×` button.
  - "Tambahkan ke context" button.
  - "Revisi di chat" button.

---

## 5. Unified Mention System & Automatic Intent Resolution

### 5.1 Removing Mode Selection
- `ArtifactMentionChips.tsx`: Render clean chips `@{title}` `v{version}` with only a remove `×` button. No "Context" or "Revise" mode pills.
- `ArtifactMentionDraft`: Mode defaults to `'context'`, but during send, intent is resolved automatically from the prompt content.

### 5.2 Heuristic Intent Classifier (`resolveArtifactIntent`)
When a message contains mentioned artifacts:
1. **Revision Intent**: Content includes modification/action words (Indonesian: `tambahkan`, `tambah`, `ubah`, `ganti`, `revisi`, `update`, `hapus`, `perbaiki`, `masukkan`, `hilangkan`; English: `add`, `insert`, `update`, `modify`, `revise`, `remove`, `delete`, `change`).
   -> Routes to `handleSendArtifactRevise` to produce a new version of the artifact.
2. **Discussion/Analysis Intent**: Content is a question or analytical query (Indonesian: `menurutmu`, `apakah`, `bagaimana`, `jelaskan`, `analisis`, `review`, `kenapa`, `evaluasi`; English: `explain`, `what`, `how`, `why`, `analyze`, `review`, `think about`, `feedback`, or ending with `?` without modification verbs).
   -> Routes to normal chat stream with artifact provided as context.

---

## 6. Interactive Checklist

### 6.1 Canvas Task List Interactivity
- In Canvas Markdown rendering, `- [ ]` and `- [x]` markdown task lines render as active, clickable checkboxes.
- Clicking a checkbox toggles its state between checked/unchecked:
  - Updates the in-memory content immediately for instantaneous feedback.
  - Updates `zona-ai:checklist:<storageKey>` in localStorage.
  - Updates the underlying markdown text (`- [ ]` <-> `- [x]`).

---

## 7. Mermaid Visual Preview

### 7.1 Visual Rendering
- Install `mermaid` package.
- Fenced code blocks with `language-mermaid`:
  - Render an interactive/responsive SVG diagram using `mermaid.render()`.
  - Contain within `overflow-x-auto max-w-full`.
  - Provide a toggle button to switch between "Preview" (default) and "Source Code".
  - If syntax is invalid, gracefully display a small warning notice and fallback to the code block.

---

## 8. Verification Strategy
- `bun x tsc --noEmit`: 0 errors.
- `bun x biome check ./src`: passing.
- Vitest unit & integration tests passing.
- Manual verification of layout docking, resizing, animations, mentions, checklist clicking, and Mermaid rendering.
- Atomic git commits per component / feature step followed by git push.
