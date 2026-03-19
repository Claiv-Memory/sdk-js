# @claiv/memory

**Give your AI a persistent memory.**

Claiv Memory is a drop-in API that gives any LLM application persistent, cross-session memory and document RAG. Works with OpenAI, Claude, LangChain, Vercel AI SDK, or any framework — two calls to integrate, zero infrastructure to manage.

[![npm version](https://img.shields.io/npm/v/@claiv/memory)](https://www.npmjs.com/package/@claiv/memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Get an API key → claiv.io](https://claiv.io)**

---

## What it does

Without Claiv, every conversation starts from zero. With Claiv:

- Your AI **remembers users across sessions** — their preferences, history, context
- You can **upload documents** and your AI answers questions about them with full citation
- Everything is **retrieved automatically** and injected into your LLM prompt — no manual retrieval logic

---

## Installation

```bash
npm install @claiv/memory
```

---

## Quickstart — 2 minutes

```typescript
import { ClaivClient } from '@claiv/memory';
import OpenAI from 'openai';

const claiv  = new ClaivClient({ apiKey: process.env.CLAIV_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(userId: string, conversationId: string, userMessage: string) {
  // 1. Recall — fetch everything Claiv knows about this user
  const memory = await claiv.recall({
    user_id: userId,
    conversation_id: conversationId,
    query: userMessage,
  });

  // 2. Call your LLM with memory injected
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: memory.llm_context.text || 'You are a helpful assistant.' },
      { role: 'user',   content: userMessage },
    ],
  });

  const reply = response.choices[0].message.content!;

  // 3. Ingest — store this turn so it's remembered next time
  await claiv.ingest({
    user_id: userId,
    conversation_id: conversationId,
    type: 'message',
    role: 'user',
    content: userMessage,
  });
  await claiv.ingest({
    user_id: userId,
    conversation_id: conversationId,
    type: 'message',
    role: 'assistant',
    content: reply,
  });

  return reply;
}
```

That's it. The AI now remembers this user across every future conversation.

---

## Document RAG

Upload documents and your AI can answer questions about them — with persistent memory layered on top.

```typescript
import { readFileSync } from 'fs';

// Upload a document — parsed into sections and indexed immediately
const { document_id, spans_created, sections } = await claiv.uploadDocument({
  user_id: 'user-123',
  project_id: 'my-project',
  document_name: 'Product Manual v2',
  content: readFileSync('manual.md', 'utf8'),
});

console.log(`Indexed ${spans_created} spans across ${sections.length} sections`);

// Now ask questions — Claiv routes to the right retrieval strategy automatically
const memory = await claiv.recall({
  user_id: 'user-123',
  conversation_id: 'session-abc',
  query: 'How do I install the product?',
  document_id, // restrict recall to this document
});

// Delete when done
await claiv.deleteDocument(document_id);
```

### Retrieval strategies (automatic)

| Query type | Strategy | What happens |
|------------|----------|--------------|
| General question | **LOCAL** | Top spans by cosine similarity |
| `"show me the installation section"` | **SECTION** | Full section fetched in reading order |
| `"summarise this document"` | **DOCUMENT** | Full document context with distillations |
| `collection_id` provided | **COLLECTION** | Multi-document tiered context |

---

## Collections (folders)

Group documents for combined recall.

```typescript
// Create a collection (acts as a folder)
const { collection } = await claiv.createCollection({
  user_id: 'user-123',
  project_id: 'my-project',
  name: 'Q4 Reports',
});

// Add documents to it
await claiv.addDocumentToCollection(collection.collection_id, {
  user_id: 'user-123',
  document_id: 'doc-abc',
});

// Recall across the whole collection
const memory = await claiv.recall({
  user_id: 'user-123',
  conversation_id: 'session-abc',
  query: 'What were our Q4 revenue figures?',
  collection_id: collection.collection_id,
});
```

---

## API Reference

### `new ClaivClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | required | Your Claiv API key |
| `baseUrl` | `string` | `https://api.claiv.io` | API base URL |
| `timeout` | `number` | `30000` | Request timeout (ms) |
| `maxRetries` | `number` | `2` | Retries on 429/5xx |
| `fetch` | `function` | `globalThis.fetch` | Custom fetch |

### Memory

| Method | Description |
|--------|-------------|
| `client.ingest(request)` | Store a memory event |
| `client.recall(request)` | Retrieve memory for a query |
| `client.forget(request)` | Delete memory by scope |

### Documents

| Method | Description |
|--------|-------------|
| `client.uploadDocument(request)` | Upload and index a document |
| `client.listDocuments(options)` | List documents for a user/project |
| `client.deleteDocument(documentId)` | Delete a document and all its data |

### Collections

| Method | Description |
|--------|-------------|
| `client.createCollection(request)` | Create a collection |
| `client.listCollections(options)` | List collections |
| `client.getCollection(id, userId)` | Get collection with document list |
| `client.deleteCollection(id, userId)` | Delete a collection |
| `client.addDocumentToCollection(id, request)` | Add document to collection |
| `client.removeDocumentFromCollection(collectionId, documentId)` | Remove document from collection |

### Usage

| Method | Description |
|--------|-------------|
| `client.getUsageSummary(range?)` | Aggregated usage with daily breakdown |
| `client.getUsageBreakdown(range?)` | Usage by endpoint |
| `client.getUsageLimits()` | Current plan limits and quota |

---

## Error handling

```typescript
import { ClaivApiError, ClaivTimeoutError, ClaivNetworkError } from '@claiv/memory';

try {
  await claiv.ingest({ ... });
} catch (err) {
  if (err instanceof ClaivApiError) {
    console.log(err.status);    // HTTP status code
    console.log(err.code);      // 'quota_exceeded' | 'invalid_request' | ...
    console.log(err.requestId); // share with support
  } else if (err instanceof ClaivTimeoutError) {
    // request timed out
  } else if (err instanceof ClaivNetworkError) {
    // network failure
  }
}
```

The SDK automatically retries `429` and `5xx` responses with exponential backoff. Client errors (`4xx`) are never retried.

---

## TypeScript

Fully typed — all request and response shapes are exported.

```typescript
import type {
  IngestRequest, RecallRequest, RecallResponse, RecallFact,
  DocumentUploadRequest, DocumentUploadResponse,
  CollectionCreateRequest, CollectionRow,
} from '@claiv/memory';
```

---

## Templates

Get up and running in under 5 minutes with a working starter:

| Template | Stack |
|----------|-------|
| [template-openai-python](https://github.com/Claiv-Memory/template-openai-python) | OpenAI + Python |
| [template-openai-nodejs](https://github.com/Claiv-Memory/template-openai-nodejs) | OpenAI + Node.js |
| [template-nextjs](https://github.com/Claiv-Memory/template-nextjs) | Next.js + Vercel AI SDK |
| [template-claude-python](https://github.com/Claiv-Memory/template-claude-python) | Anthropic Claude + Python |
| [template-langchain](https://github.com/Claiv-Memory/template-langchain) | LangChain agents |
| [template-document-rag-python](https://github.com/Claiv-Memory/template-document-rag-python) | Document RAG + Python |
| [template-document-rag-nextjs](https://github.com/Claiv-Memory/template-document-rag-nextjs) | Document RAG + Next.js |

---

## Links

- [claiv.io](https://claiv.io) — sign up and get an API key
- [Python SDK](https://github.com/Claiv-Memory/sdk-py)
- [Issues](https://github.com/Claiv-Memory/sdk-js/issues)
