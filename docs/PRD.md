# Zona.ai Product Requirements Document (PRD)

## 1. Product Vision
Zona.ai is an intelligent, multi-model AI chat workspace designed to provide seamless access to the world's leading language models. It empowers users to converse with their preferred model or compare multiple models side-by-side in real time. Inspired by products like AndalAI, Zona.ai serves as a unified interface that prioritizes model optionality, performance, and transparency.

## 2. Problem Statement
The current landscape of AI chat tools (e.g., ChatGPT, Claude, Gemini) forces users into isolated ecosystems, locking them into a single provider's capabilities and interface. When users encounter complex prompts or subjective queries, they cannot easily compare how different models interpret and respond to the same instruction without manually copying and pasting across multiple browser tabs. This creates friction, delays decision-making, and limits the user's ability to evaluate model performance effectively.

## 3. Target Users
- **Developers & Engineers:** Need to compare coding capabilities, syntax accuracy, and problem-solving approaches across different models.
- **Researchers & Analysts:** Require deep, nuanced answers and need to cross-reference model outputs for bias, accuracy, and thoroughness.
- **Content Creators & Writers:** Seek creative variation and want to evaluate different tones, styles, and brainstorming capabilities side-by-side.
- **Businesses Evaluating AI:** Organizations looking to determine which underlying models perform best for their specific use cases before committing to an enterprise API contract.

## 4. Primary Use Cases
- **Normal Chat:** A user selects a single AI model (e.g., GPT-4o, Claude 3.5 Sonnet) and engages in a standard, continuous conversation with streaming text responses.
- **Compare Mode:** A user selects multiple models and sends a single prompt. The workspace routes the prompt to all selected models simultaneously, displaying their independent, parallel streaming responses side-by-side for direct comparison.

## 5. Core Value Proposition
Zona.ai provides unified, multi-model access through a single, cohesive interface. It eliminates provider lock-in and introduces real-time comparison capabilities, allowing users to evaluate and leverage the strengths of various leading AI models simultaneously without context switching.

## 6. Differentiation
- **Compare Mode:** First-class support for side-by-side, parallel model comparison on the exact same prompt.
- **Model-Agnostic Approach:** We do not favor any specific provider. The platform dynamically surfaces models based on capabilities.
- **Unified Workspace:** Features like RAG, file processing, and web search work uniformly across different models, normalizing the user experience regardless of the underlying provider's native capabilities.

## 7. Feature Specification — MVP Scope
The Minimum Viable Product (MVP) will include the following capabilities:
- **AI Chat (Single Model):** Standard chat interface.
- **Model Selector:** UI to choose models, categorizing them by provider or capability.
- **Auto Model Selection (Smart Router):** Default intelligent routing that automatically selects the appropriate model tier (fast, deep reasoning, or coding) based on prompt complexity and context.
- **Composer Skills / Task Presets:** Specialized prompt modifiers selectable directly from the composer (e.g. Checklist Generator, PRD/Plan Generator, AI Agent Skill Creator) to enforce specialized output structures.
- **Multi-Model Comparison (Compare Mode):** Core side-by-side chat view supporting up to 4 models simultaneously.
- **Parallel Model Generation:** Concurrent API calls to multiple models.
- **Streaming Responses:** Real-time token streaming to the client.
- **Stop Generation:** Ability to halt the AI's response mid-stream.
- **Regenerate Response:** Request a new answer from the current or selected models.
- **Chat History:** Persistent storage and retrieval of past conversations.
- **Conversation Management:** Create new, rename, and delete conversations.
- **Markdown Rendering:** Proper rendering of markdown elements (tables, lists, bold, etc.).
- **Syntax-Highlighted Code Blocks:** Formatted code with copy functionality.
- **Image Input:** Support for image uploads when using vision-capable models.
- **File Upload & Document Processing:** Ability to upload and parse documents.
- **RAG (PostgreSQL + pgvector):** Vector-based search for document-grounded responses.
- **Web Search (Tavily):** Real-time web search capabilities for up-to-date answers.
- **Citations/Sources:** Displaying links/references for web search and RAG results.
- **Model Capability Awareness:** UI indicating if a model supports vision, web search, etc.
- **Token/Usage Tracking:** Logging of prompt and completion tokens.
- **Tiered Credit Quota System:** User credit balance deduction based on model tiers (Economy: 1 credit, Balanced/Reasoning: 4 credits, Premium Flagship: 15 credits) with atomic transaction logging and partial failure refunds. Includes a 1-click dev reset balance button.
- **Latency Tracking:** Measuring response times (Time-to-first-token, total generation time).
- **Error/Retry States:** Graceful degradation and user feedback for API failures.
- **Authentication:** Google OAuth-only sign-up and sign-in via Better Auth (zero passwords, frictionless 1-click login).

## 8. Post-MVP Scope
The following features are reserved for future iterations:
- **Consensus Answer:** Synthesizing multiple model outputs into a single, unified answer.
- **Blind Comparison:** Hiding model names during Compare Mode to remove bias.
- **Model Leaderboard:** Aggregated statistics on which models users prefer.
- **Personal Model Ranking:** User-specific statistics and preferences.
- **Debate Mode:** Models interacting with or critiquing each other's responses.
- **Deep Research:** Multi-step, autonomous agentic research workflows.
- **BYOK (Bring Your Own Key):** Allowing users to use their own provider API keys.

## 9. Non-Goals (Current)
We are explicitly NOT building the following at this time:
- Autonomous Agents (executing actions on the user's behalf)
- MCP (Model Context Protocol) integrations
- Shared workspaces / team collaboration
- Public sharing links for conversations
- Voice input / output
- Image generation capabilities
- Native mobile applications (iOS/Android)
- Pricing/subscription plans (no monetization features in MVP)

## 10. Detailed User Flows

### Registration and Login
1. User navigates to the landing page.
2. User clicks "Sign Up" or "Login".
3. User enters email and password.
4. System validates credentials via Better Auth.
5. Upon success, user is redirected to the main chat workspace.

### Starting a New Conversation (Normal Chat)
1. User clicks "New Chat" button.
2. System creates a new empty conversation.
3. User clicks the model selector dropdown.
4. User selects a single model (e.g., Llama 3).
5. User types a prompt in the input bar and hits "Send".

### Sending a Message and Receiving Streaming Response
1. User sends a prompt.
2. User message appears in the chat log.
3. UI displays a loading state (e.g., blinking cursor).
4. System streams tokens back from the AI Gateway.
5. UI renders tokens in real-time, parsing markdown and code blocks as they arrive.
6. Generation completes; UI displays copy button and token/latency metrics.

### Stopping Generation Mid-Stream
1. While model is generating, user clicks the "Stop" (square) button.
2. Client aborts the stream connection.
3. UI stops updating the response block.
4. The partial response is saved to the chat history.

### Regenerating a Response
1. User hovers over the latest AI response.
2. User clicks the "Regenerate" button.
3. System removes the previous AI response from the current context view.
4. System resends the previous user prompt to the selected model.
5. New response streams in.

### Switching Models Mid-Conversation
1. In an ongoing conversation, user clicks the model selector at the top or above the input bar.
2. User selects a different model.
3. Next prompt sent by the user will be routed to the new model, maintaining the previous conversation history as context (if supported/fits in context window).

### Starting a Compare Mode Conversation
1. User creates a new chat.
2. User toggles the interface to "Compare Mode".
3. UI splits into parallel vertical panels or displays a multi-select dropdown.
4. User selects Model A and Model B.
5. User types a prompt and sends.

### Viewing Parallel Streaming Responses
1. Prompt is dispatched to selected models concurrently.
2. UI displays dedicated response blocks for Model A and Model B side-by-side.
3. Streams from both models render simultaneously and independently.
4. User can scroll each panel or view them in a synced grid.

### Handling Partial Model Failure in Compare Mode
1. User sends prompt in Compare Mode to Model A and Model B.
2. Model A responds successfully.
3. Model B times out or returns an API error.
4. UI displays Model A's response normally.
5. UI displays an error state in Model B's panel with a localized "Retry" button.
6. User can retry Model B without affecting Model A's completed output.

### Uploading a File and Asking Questions
1. User clicks the attachment icon in the input bar.
2. User selects a PDF or text file.
3. System uploads the file to object storage and triggers background text extraction and vectorization (pgvector).
4. UI shows the file attached as a pill in the input area.
5. User types a question and sends.
6. System performs RAG against the document vector index, retrieves context, and sends it with the prompt.
7. Model answers, citing the document.

### Using Web Search in a Conversation
1. User toggles the "Web Search" switch in the input bar.
2. User types a question about a recent event and sends.
3. System queries Tavily with the prompt to retrieve web snippets.
4. UI briefly shows a "Searching the web..." indicator.
5. System injects search results into the prompt context.
6. Model answers, providing markdown citations to the sourced URLs.

### Managing Conversations
1. User views the sidebar containing chat history.
2. User clicks the three-dot menu on a conversation.
3. User selects "Rename" to manually edit the title, or "Delete" to remove it.
4. Alternatively, user uses the sidebar search bar to filter past conversations by keyword.

### Viewing Model Information and Capabilities
1. User opens the model selector.
2. User clicks an info icon next to a model.
3. A tooltip or modal appears showing: Provider name, context window size, vision support, and web search support.

## 11. Functional Requirements
- **FR-001:** The system MUST authenticate users exclusively via Google OAuth using Better Auth (no email/password forms).
- **FR-002:** The system MUST provide an interface to start new conversations.
- **FR-003:** The system MUST allow users to select a single model for a conversation.
- **FR-004:** The system MUST stream AI text responses to the client in real-time.
- **FR-005:** The system MUST support Markdown rendering, including tables, lists, and bold/italic text.
- **FR-006:** The system MUST render code blocks with syntax highlighting and a "Copy" button.
- **FR-007:** The system MUST allow users to stop an ongoing generation stream.
- **FR-008:** The system MUST allow users to regenerate the last AI response.
- **FR-009:** The system MUST allow users to select between 2 and 4 models simultaneously in Compare Mode.
- **FR-010:** The system MUST dispatch prompts concurrently to all selected models in Compare Mode.
- **FR-011:** The system MUST display Compare Mode responses side-by-side with independent loading and streaming states.
- **FR-012:** The system MUST persist conversation history (prompts and responses) to the PostgreSQL database.
- **FR-013:** The system MUST provide a sidebar to view, rename, and delete past conversations.
- **FR-014:** The system MUST allow users to attach files to prompts.
- **FR-015:** The system MUST extract text from uploaded files and store embeddings using pgvector.
- **FR-016:** The system MUST execute RAG queries when documents are attached to a conversation.
- **FR-017:** The system MUST integrate with Tavily to perform web searches when explicitly toggled by the user.
- **FR-018:** The system MUST log token usage (prompt/completion) and latency metrics for every API call.
- **FR-019:** The system MUST display model capability metadata (e.g., vision support) in the UI.
- **FR-020:** The system MUST handle individual model API failures gracefully, allowing retries without affecting parallel streams in Compare Mode.
- **FR-021:** The system MUST provide an 'Auto (Smart Router)' option that dynamically classifies prompt complexity (lightweight, deep reasoning, or coding) and routes to the appropriate model while exposing the resolved model transparently to the user.
- **FR-022:** The system MUST provide a Skill Selector in the input composer allowing users to activate specialized response templates (Checklist, PRD/Plan, AI Agent Skill) that augment model output formatting in both Normal Chat and Compare Mode.
- **FR-023:** The system MUST enforce tiered credit deductions for prompt submissions (e.g. 1 credit for Economy, 4 credits for Balanced/Reasoning, 15 credits for Premium Flagship), deduct cumulative credits in Compare Mode, prevent generation when balance is insufficient, and refund credits for failed generation runs.
- **FR-024:** The system MUST provide a 1-click dev reset balance button in development mode that instantly resets the user's credit balance to 100 points.

## 12. Non-Functional Requirements
- **NFR-001 Performance (Streaming):** Time-to-first-token (TTFT) from the internal system (excluding AI Gateway latency) must be under 150ms.
- **NFR-002 Availability:** The core application UI must target 99.9% uptime (excluding external AI provider outages).
- **NFR-003 Security:** Passwords must be hashed. All data in transit must be encrypted via HTTPS. API routes must be protected by Better Auth server-side checks.
- **NFR-004 Scalability:** The database schema and server functions must support concurrent parallel generation requests from multiple users without blocking the Node/Bun event loop.
- **NFR-005 Accessibility:** The UI must meet a baseline of WCAG 2.1 AA, including keyboard navigation for chat history and contrast-compliant text.
- **NFR-006 Responsiveness:** The UI must be mobile-first and responsive. Compare Mode may adapt to a stacked or tabbed view on small screens.
- **NFR-007 Data Integrity:** Conversational data must be linked to the authenticated user ID via foreign keys to prevent cross-account data leakage.

## 13. Acceptance-Level Product Behavior
- **Normal Chat is Done when:** A user can log in, select a model, send a prompt, see the response stream smoothly with proper formatting, and find the chat in their history upon refreshing the page.
- **Compare Mode is Done when:** A user can select at least two models, send a prompt, watch both models stream side-by-side simultaneously, and if one fails, the other continues seamlessly.
- **Credit Quota is Done when:** A user with 100 credits triggers a 4-credit generation, balance updates to 96 with an audit row in `credit_transactions`, requests exceeding the user balance are blocked with an informative prompt, and any failed model stream in Compare Mode is immediately credited back.
- **File Upload & RAG is Done when:** A user can upload a PDF, ask a specific question whose answer only exists in the PDF, and the model returns the correct answer referencing the document.
- **Web Search is Done when:** A user asks for current news with the web toggle on, and the model responds accurately with clickable URL citations.

## 14. Success Metrics
- **Successful Generation Rate:** Percentage of AI requests that return a completed response without error.
- **Average Latency (TTFT & Total):** Monitored via Langfuse/OpenTelemetry.
- **Compare Mode Adoption:** Percentage of conversations utilizing Compare Mode vs. Normal Chat.
- **User Retention:** Percentage of users who return to the platform within 7 days of their first interaction.
- **RAG/Search Utilization:** Frequency of users attaching files or enabling web search per session.

## 15. Open/TBD Product Decisions
The following specifications have not been finalized and must be defined or made configurable prior to launch:
- **Maximum number of models in Compare Mode:** TBD (Configurable limit needed to manage UI clutter and concurrent connection limits).
- **File size limits:** TBD (Configurable limit needed for payload size constraints and RAG processing limits).
- **Token limits per conversation:** TBD (Configurable cap needed to prevent context bloat and excessive API costs).
- **Timeout values:** TBD (Configurable thresholds needed for AI Gateway requests and stream persistence).
- **Supported authentication providers:** TBD (Currently email/password via Better Auth; need to decide on OAuth providers like Google, GitHub).
- **Deployment provider:** TBD (Need to select hosting platform for Bun/TanStack Start e.g., Vercel, Railway, Fly.io).
- **User quotas/rate limits:** TBD (Need to define limits on requests per minute/hour per user).
- **Pricing/monetization:** TBD (Need to determine if/how usage will be billed post-MVP).
