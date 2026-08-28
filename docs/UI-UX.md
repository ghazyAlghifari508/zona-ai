# Zona.ai UI/UX Specification

This document details the UI/UX specification for Zona.ai, adapting the MindMarket Style Reference design system into a functional, multi-model AI chat workspace.

## 1. Zona.ai Visual Identity

- **Personality**: Warm, friendly, approachable AI workspace.
- **Canvas**: Cream paper L0 (`#f5f1e4`) as the primary page background (not cold white or dark gray).
- **Styling**: Sticker-soft rounded elements (`50px` border radius) combined with structural rigidity.
- **Typography Philosophy**: Editorial confidence with Inter typography. Giant headlines on marketing pages; clean, functional density in the chat workspace.
- **Differentiation**: Emphatically NOT a generic dark SaaS AI dashboard. It feels organic and inviting.

## 2. Design Tokens

### Colors
- **Canvas / Backgrounds**:
  - Cream Paper L0: `#f5f1e4` (Primary background)
  - White L1: `#ffffff` (Elevated cards, navigation, sidebars)
  - Sandstone L2: `#e0dbce` (Recessed elements, hovered states)
- **Text & Outlines**:
  - Ink Black: `#2c2e2a` (Primary text, structural lines)
  - Stone Gray: `#80827f` (Secondary text, metadata, disabled states)
- **Structural Accents**:
  - Fresh Grass: `#8ed462` (Primary action, key highlights, structural elements)
- **Decorative Accents (NOT for functional states)**:
  - Sky Pop: `#2ba0ff`
  - Coral Pop: `#ff705d`
  - Sunshine Pop: `#f5e211`
  - Deep Clay: `#a34936`
  - Midnight: `#111827`

### Typography Scale (Inter)
- **Display-lg**: `144px` / `-2%` tracking / `95%` line-height
- **Display-sm**: `81px` / `-2%` tracking / `95%` line-height
- **Heading**: `53px` / `-1%` tracking / `100%` line-height
- **Heading-sm**: `30px` / `0%` tracking / `110%` line-height
- **Subheading**: `20px` / `0%` tracking / `120%` line-height
- **Body-lg**: `18px` / `0%` tracking / `140%` line-height
- **Body-sm**: `15px` / `0%` tracking / `140%` line-height

### Spacing & Layout
- **Base Unit**: `4px` scale (e.g., 4, 8, 12, 16, 24, 32, 48, 64)

### Border Radius
- **Small Elements (badges, code blocks, inner cards)**: `10px`
- **Large Elements (buttons, main cards, dialogs, nav pills)**: `50px`
- **Illustrations/Hero images**: `63.75px`

### Surfaces & Elevation
- No drop shadows are used. Elevation is conveyed by stacking surfaces: Cream L0 (base) -> White L1 (cards) -> Sandstone L2 (recessed).
- Borders (`1px solid Ink Black` or `Stone Gray`) can be used to delineate structural boundaries.

### Tailwind v4 `@theme` Configuration (Example)
```css
@theme {
  --color-canvas-cream: #f5f1e4;
  --color-surface-white: #ffffff;
  --color-surface-sandstone: #e0dbce;
  --color-text-ink: #2c2e2a;
  --color-text-stone: #80827f;
  --color-accent-grass: #8ed462;
  --color-pop-sky: #2ba0ff;
  --color-pop-coral: #ff705d;
  --color-pop-sunshine: #f5e211;

  --font-sans: 'Inter', sans-serif;
  
  --radius-sm: 10px;
  --radius-full: 50px;
}
```

## 3. Typography
- **Font Family**: Inter as the single, universal font family.
- **Display Sizes (81-144px)**: Reserved strictly for landing page headlines.
- **Heading (53px)**: Section headers on marketing pages.
- **Heading-sm (30px)**: Workspace section headers (e.g., Settings titles).
- **Subheading (20px)**: Conversation titles, sidebar headers, model names in compare mode.
- **Body-lg (18px)**: Primary chat message text (maintains readability for dense content).
- **Body-sm (15px)**: UI labels, timestamps, metadata, token counts.

## 4. Colors

### Usage Guide
- **Cream Paper (#f5f1e4)**: The bedrock of the app. Fills the viewport behind the main UI.
- **White (#ffffff)**: For interactive floating elements (sidebars, chat input, model columns).
- **Sandstone (#e0dbce)**: Used for hovered list items, secondary buttons, or code block backgrounds.
- **Ink Black (#2c2e2a)**: Used for all primary reading text, borders on structural elements, and primary solid buttons (along with Fresh Grass).
- **Fresh Grass (#8ed462)**: The primary branding highlight. Can be used for active states, primary CTA buttons, or selected elements.
- **Decorative Accents (Sky/Coral/Sunshine)**: Use sparingly in illustrations, empty state graphics, or user avatars. **NEVER use for error (Coral), warning (Sunshine), or success/info (Sky) semantic states.** 
- **Functional States**: Use tonal shifts of Ink/Stone or explicit iconography (e.g., a "warning" icon) rather than relying on color alone, maintaining accessibility.

## 5. Responsive Behavior

- **Desktop (>1024px)**: Full layout. Fixed sidebar (left) + Chat area (center) + Multi-column compare mode (number of columns adapts to selected model count — max TBD/configurable).
- **Tablet (768px - 1024px)**: Collapsible sidebar. Compare mode uses fewer columns with horizontal scroll or stacking as needed.
- **Mobile (<768px)**: 
  - Sidebar hidden behind a hamburger menu or accessible via swipe.
  - Chat area takes full screen.
  - Bottom-anchored composer.
  - Compare mode uses swipeable panels/tabs instead of side-by-side columns.

## 6. Accessibility

- **Contrast**: WCAG 2.1 AA baseline. Ensure text on Cream, White, and Sandstone passes contrast requirements.
- **Keyboard Navigation**: All interactive elements must be focusable and operable via keyboard.
- **Focus Indicators**: Clear focus rings (e.g., 2px solid Ink Black or Fresh Grass outline) on focus-visible.
- **Screen Readers**: Proper ARIA roles for chat feeds (e.g., `role="log"` or `aria-live="polite"` for streaming text), buttons, and dialogs.
- **Reduced Motion**: Respect `prefers-reduced-motion` for transitions (disable slide-ins/fade-ins if set).

## 7. Page Specifications

### Landing Page
- **Canvas**: Cream L0.
- **Hero**: Giant headline (Display-lg `140-144px`), warm and confident.
- **Navigation**: Floating White L1 pill at the top center with 50px radius.
- **Content**: Feature cards (White, 50px radius).
- **CTAs**: Solid buttons (Fresh Grass or Ink Black) to Sign up/Sign in.
- Retains the marketing/editorial feel from the DESIGN.md spec.

### Authentication Pages
- **Layout**: Centered White L1 card on Cream L0 canvas.
- **Card Styling**: 50px radius, generous padding (40px), minimal and friendly.
- **Authentication Method**: **Google OAuth Only** (zero password inputs, zero registration forms).
- **Primary Action**: Single prominent pill button (50px radius, White L1 or Fresh Grass accent border) with Google SVG mark reading *"Masuk dengan Google"* / *"Continue with Google"*.
- **Subtext**: Short note (Body-sm, Stone Gray): *"Satu klik untuk mulai membandingkan model AI."*

### Main Chat Workspace
*The core functional view. Needs density and high usability.*
- **Background**: Cream L0 canvas.
- **Sidebar (Left)**: 
  - Surface: White L1.
  - Content: "New Chat" button, search bar, scrollable conversation list, user profile with **Live Credit Balance Widget** (`💎 85 Kredit`) and a small **[Reset 100 ⚡]** dev button for instant local refill.
  - Conversation Items: Title (Body-sm), Model icon/badge, Timestamp. Hover state uses Sandstone L2.
- **Chat Area (Center)**:
  - Scrollable message list. Uses TanStack Virtual if conversations get extremely long.
  - **User Messages**: Right-aligned or styled with a subtle Sandstone L2 bubble (10px radius).
  - **Assistant Messages**: Left-aligned, no bubble (transparent background), accompanied by a model avatar/badge. Markdown rendered text.
  - **Code Blocks**: Dark or Sandstone background (10px radius), syntax highlighting, copy to clipboard button.
  - **Streaming**: Actual streaming text appears, with a subtle blinking cursor or loading indicator.
  - **Empty State**: Friendly welcome message, large model selector, suggested prompt chips.

### Model Selector
- **Single Mode**: A clean dropdown or modal (White L1, 10px radius). Shows model name, provider, small capability badges, and **Credit Cost Badge** (e.g. `Auto: 1 - 4 ⚡`, `Gemini 3.7 Flash: 4 ⚡`, `GPT 5.6 Sol: 15 ⚡ [Premium]`).
  - **Default Option**: **`Auto (Smart Router)`** is pinned at the top with a subtle lightning/sparkle badge.
  - **Routing Badge**: When `Auto` is active, the generated assistant response displays a subtle, transparent badge indicating which model handled the request (e.g., *"⚡ Routed to Gemini 3.7 Flash High"*).
  - **Insufficient Balance State**: If the user's credit balance is lower than a model's cost, that model is dimmed with an informative tooltip (*"Butuh 15 kredit (Sisa 8)"*).
- **Compare Mode**: A multi-select modal or inline chip interface for selecting **2 to 4 explicit models** (Auto is disabled in Compare Mode). Shows cumulative credit cost in real-time.
- **Toggle**: A prominent segmented control (50px radius pill) to switch between "Standard" and "Compare" mode.

### Compare Mode Layout
- **User Prompt**: Spans full width at the top to anchor the context.
- **Model Columns**: Supports **2 to 4 side-by-side columns**:
  - **2 Models**: Clean 50/50 side-by-side split.
  - **3 Models**: 3 equal-width columns on desktop.
  - **4 Models**: 4 columns side-by-side with smooth horizontal scrolling or adaptive 2x2 grid on medium screens.
  - White L1 card surfaces, 50px radius top corners.
- **Headers**: Each column has a fixed header showing the Model Name, status indicator, and quick actions.
- **Scrolling**: Columns scroll independently to allow reading at different paces.
- **Metrics**: Each panel displays status (streaming, completed, failed), latency, and token count (Body-sm, Stone Gray).
- **Mobile Behavior**: Horizontal swipe (carousel style) or tabs to switch between model responses.

### Composer (Message Input)
- **Position**: Fixed at the bottom of the chat area.
- **Styling**: Floating White L1 pill container (50px radius), soft and elevated on the Cream Paper canvas.
- **Input Area**: Auto-resizing textarea with clear placeholder (e.g. *"Tanyakan apa saja ke Zona.ai..."*).
- **Bottom Toolbar Layout**:
  - **Left Actions Group**:
    - **Model Selector Dropdown**: Pill button showing provider icon + model name (e.g., `[OpenAI] GPT-5.6 Sol ⌄` or `[⚡] Auto ⌄`).
    - **Skill Selector Dropdown**: Pill button `[🛠️ Skill ⌄]` displaying the active skill or "Skill" label.
    - **Attachment Button**: Icon button `[📎]` for uploading documents and images.
    - **Web Search Toggle**: Icon button `[🌐]` to toggle real-time web retrieval.
  - **Right Action**:
    - **Send / Submit Button**: Rounded accent pill button (`50px` radius) with an up-arrow icon (`↑`), styled with brand tone. Transforms to a stop button (`■`) during ongoing generation.
- **Skill Selector Popover Menu**:
  - Triggered by clicking `[🛠️ Skill ⌄]`.
  - Floating card (White L1, 15px radius, subtle hairline border).
  - Header: `PILIH SKILL` (Body-sm, uppercase, Stone Gray).
  - List of selectable options with Icon, Title, Subtitle, and active indicator:
    1. **Tanpa skill** (Icon: Sparkle `✦`): *"Chat biasa."* (Default)
    2. **Pembuat Checklist** (Icon: Checklist `☑`): *"Ubah tujuan atau permintaan jadi checklist yang dapat dicentang."*
    3. **Generator PRD / Plan** (Icon: Document `📄`): *"Ubah ide aplikasi jadi rencana implementasi atau PRD high-level yang lengkap."*
    4. **AI Agent Skill Creator** (Icon: Robot/Wrench `🤖`): *"Buat modul instruksi / best-practice terstruktur untuk AI coding agent."*
  - Active item is highlighted with warm tint background and checkmark (`✓`).
- **Contextual Recommendation Hint (Below Composer)**:
  - Subtle text centered beneath the composer (Body-sm, Stone Gray with accent action):
  - *Example:* *"GPT-5.6 Sol memakai kredit lebih cepat — **pakai Auto →**"* when a high-tier model is manually selected.

### Attachment UI
- **Drag & Drop**: Screen overlay or specific zone turns to Sandstone L2 when dragging a file.
- **Preview**: Thumbnails (10px radius) above the text input.
- **Badges**: For PDFs/docs, a simple file icon + name + type badge.
- **Controls**: Upload progress indicator (circular spinner), remove (X) button.

### Web Source/Citation UI
- Displayed below the assistant's message.
- Numbered chips inline with text linking to a collapsible "Sources" drawer.
- **Source Drawer**: Lists title, URL (truncated), and snippet preview (Body-sm). White L1 card, 10px radius.

### Settings
- Accessed via sidebar. Opens in a modal (White L1, 50px radius) or dedicated view.
- Sections: User profile, Model API keys/preferences, Default model, Theme (reserved for future).

### Empty States
- **New Conversation**: Cream canvas with a centralized, warm greeting. Suggested prompts styled as White L1 pills.
- **No Conversations**: Friendly graphic in sidebar, encouraging the user to start a chat.
- **Search Empty**: Clear "No results found" message (Stone Gray).

### Loading States
- Avoid fake progress bars.
- Use skeleton loaders (pulsing Sandstone L2 shapes) for conversation lists.
- Real-time text streaming for active generations.
- File uploads show actual percentage or deterministic circular progress.

### Error States
- Inline error messages inside the chat feed (e.g., "Message failed to send. [Retry]") rather than blocking modals.
- Toast notifications for transient app errors (e.g., "Connection lost").
- Avoid Coral Pop for functional error states; use semantic icons and standard red/orange tones if absolutely necessary, or rely on bold typography and borders.

### Mobile Behavior Summary
- **Navigation**: Swipe from left edge to open sidebar.
- **Chat**: Full screen.
- **Input**: Anchored to bottom, accounting for mobile keyboards (safe area insets).
- **Compare**: Stacked UI with swipeable tabs per model.
