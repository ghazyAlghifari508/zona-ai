# Seed & Mock Data

Define safe development/test data for Zona.ai.

### Synthetic Users
```typescript
// Test user accounts (for development/testing only)
const testUsers = [
  {
    id: 'test-user-001',
    name: 'Alice Developer',
    email: 'alice@test.zona.ai',
    password: 'TestPassword123!', // Only for test/dev seed
  },
  {
    id: 'test-user-002', 
    name: 'Bob Tester',
    email: 'bob@test.zona.ai',
    password: 'TestPassword123!',
  },
];
```
These are clearly marked as TEST-ONLY.

### Mock Models
Define mock model registry entries for testing when 9Router is offline:
- `mock-gemini-3-7-flash-high` (capabilities: text, vision, files, tools, reasoning; contextWindow: 1048576)
- `mock-gpt-5-6-sol` (capabilities: text, vision, files, tools, reasoning; contextWindow: 372000)
- `mock-fast-model` (capabilities: text only, fast category)

All mock model IDs MUST be prefixed with `mock-` and clearly documented as test-only. They must NEVER silently become production registry values.

### Sample Conversations
Provide 2-3 sample conversation structures:
1. A normal chat conversation with 4-6 messages
2. A compare mode conversation with parallel responses
3. A conversation with web search citations

### Sample Attachments Metadata
```typescript
const mockAttachments = [
  { fileName: 'sample-report.pdf', fileSize: 524288, mimeType: 'application/pdf' },
  { fileName: 'data.csv', fileSize: 1024, mimeType: 'text/csv' },
  { fileName: 'photo.png', fileSize: 2097152, mimeType: 'image/png' },
];
```

### Mock Web Search Results
```typescript
const mockWebResults = [
  { url: 'https://example.com/article-1', title: 'Understanding RAG Systems', snippet: 'RAG combines retrieval and generation...', score: 0.95 },
  { url: 'https://example.com/article-2', title: 'AI Model Comparison Guide', snippet: 'Comparing different AI models...', score: 0.88 },
];
```

### Mock Generation States
Provide examples of generation_runs in various states:
- queued, streaming, completed, cancelled, failed
- With sample token counts and latency values

### Mock Streaming Events
Provide sample streaming event sequences for testing stream parsing.
