# Definition of Done

### Global Definition of Done
Every feature/task must meet ALL of these before being considered done:

1. **Code Implemented**: Feature code is written and functional
2. **Requirement Fulfilled**: Matches PRD specification
3. **No Architecture Violation**: Uses locked stack, no unauthorized dependencies
4. **No Secret Exposure**: No credentials in client code, HTML, or logs
5. **Validation Complete**: Input validation via Zod, server-side validation
6. **Auth/Authorization Correct**: Session verified, ownership checked
7. **Loading States Handled**: Skeleton loaders, streaming indicators, no blank screens
8. **Error States Handled**: User-friendly messages, retry options, no raw errors
9. **Responsive UI**: Works on desktop, tablet, mobile
10. **Accessibility Baseline**: Keyboard navigable, screen reader friendly, sufficient contrast
11. **TypeCheck Passes**: `tsc --noEmit` passes with zero errors
12. **Lint Passes**: Biome lint/format passes
13. **Unit Tests Pass**: Relevant unit tests written and passing
14. **Integration Tests Pass**: Relevant integration tests written and passing
15. **E2E Critical Path Passes**: Core user flows work end-to-end
16. **No Unexpected Console Errors**: Clean console in development
17. **Data Persists Correctly**: Refresh/reload preserves state
18. **Docs Updated**: If API/schema/contract changed, docs updated

### Feature-Specific DoD:

#### Single-Model Chat DoD
- Can select a model from registry
- Can send a message and see streaming response
- Can stop generation mid-stream, partial content preserved
- Can regenerate a response
- Messages display with markdown rendering and syntax highlighting
- Token usage and latency displayed per generation
- Conversation title auto-generated
- Works with different model capabilities (vision, reasoning)

#### Compare Mode DoD
- Can select 2+ models
- Can send a prompt, all models respond in parallel
- Each model streams independently
- One model failing doesn't affect others
- Can retry individual failed models
- Can cancel individual models or all
- Side-by-side layout on desktop, swipeable on mobile
- Token usage and latency displayed per model
- Comparison run status tracked correctly

#### File Upload DoD
- Can drag-and-drop or click to upload files
- File type and size validated before upload
- Upload progress shown
- Preview for images, name/type for documents
- Can remove attachments before sending
- Files stored in R2, metadata in PostgreSQL
- Vision-capable models receive images as file parts
- Non-vision models reject image-only requests with clear error

#### RAG DoD
- Uploaded documents processed: extracted → chunked → embedded → stored
- User questions retrieve relevant chunks via similarity search
- Retrieved context injected into AI prompt
- Works with PDF, DOCX, TXT, CSV
- Processing failures handled gracefully
- Processing status visible to user

#### Web Search DoD
- User can toggle web search on/off
- Search results retrieved from Tavily
- Results injected into prompt as context
- AI response includes numbered citations
- Sources displayed below response with title, URL, snippet
- In Compare Mode: same search results sent to all models (Fair Compare)

#### Authentication DoD
- Can register with email/password
- Can sign in with email/password
- Session persists across page refreshes
- Protected routes redirect to login
- Can sign out (session destroyed)
- Cannot access other users' data
- Server functions verify auth on every call
