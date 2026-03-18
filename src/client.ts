import type {
  ClaivClientOptions,
  IngestRequest,
  IngestResponse,
  RecallRequest,
  RecallResponse,
  ForgetRequest,
  ForgetResponse,
  V2RecallRequest,
  V2RecallResponse,
  V2ForgetRequest,
  V2ForgetResponse,
  V3IngestRequest,
  V3RecallRequest,
  V3RecallResponse,
  V3ForgetRequest,
  V3ForgetResponse,
  V3FeedbackRequest,
  V3FeedbackResponse,
  V5IngestRequest,
  V5IngestResponse,
  V5RecallRequest,
  V5RecallResponse,
  V5FeedbackRequest,
  V5FeedbackResponse,
  DeletionReceipt,
  ListDeletionReceiptsResponse,
  UsageRange,
  UsageSummaryResponse,
  UsageBreakdownResponse,
  UsageLimitsResponse,
  ApiErrorBody,
  DocumentUploadRequest,
  DocumentUploadResponse,
  DocumentListResponse,
  CollectionCreateRequest,
  CollectionCreateResponse,
  CollectionListResponse,
  CollectionGetResponse,
  CollectionAddDocumentRequest,
} from './types.js';

// IngestRequest and RecallRequest are the current V6 types — these aliases
// keep the named V6 method signatures clear.
type V6IngestRequest = IngestRequest;
type V6IngestResponse = IngestResponse;
type V6RecallRequest = RecallRequest;
type V6RecallResponse = RecallResponse;
import { ClaivApiError, ClaivTimeoutError, ClaivNetworkError } from './errors.js';

const DEFAULT_BASE_URL = 'https://api.claiv.io';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ClaivClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: ClaivClientOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required');
    }
    if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout <= 0)) {
      throw new Error('timeout must be a positive number');
    }
    if (
      options.maxRetries !== undefined &&
      (!Number.isInteger(options.maxRetries) || options.maxRetries < 0)
    ) {
      throw new Error('maxRetries must be a non-negative integer');
    }
    if (options.fetch !== undefined && typeof options.fetch !== 'function') {
      throw new Error('fetch must be a function');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (options.fetch) {
      this._fetch = options.fetch;
    } else if (typeof globalThis.fetch === 'function') {
      this._fetch = globalThis.fetch;
    } else {
      throw new Error('No fetch implementation available. Provide options.fetch.');
    }
  }

  // -------------------------------------------------------------------------
  // Core Memory Endpoints
  // -------------------------------------------------------------------------

  /**
   * Ingest a memory event.
   *
   * Stores context your AI should remember — user messages, tool calls, or
   * application events. Returns immediately; enrichment happens asynchronously.
   */
  async ingest(request: IngestRequest): Promise<IngestResponse> {
    return this.post<IngestResponse>('/v6/ingest', request);
  }

  /**
   * Recall relevant memory for a task.
   *
   * Returns ranked memory blocks that fit within the specified token budget,
   * along with citations linking each block to its source event.
   */
  async recall(request: RecallRequest): Promise<RecallResponse> {
    return this.post<RecallResponse>('/v6/recall', request);
  }

  /**
   * Forget (delete) memory matching the given scope.
   *
   * Deletes memory for the specified user, optionally scoped by
   * conversation_id, project_id, and/or time range. Returns a receipt
   * with deletion counts.
   */
  async forget(request: ForgetRequest): Promise<ForgetResponse> {
    return this.post<ForgetResponse>('/v6/forget', request);
  }

  // -------------------------------------------------------------------------
  // V2 Memory Endpoints (assertion-based)
  // -------------------------------------------------------------------------

  /**
   * V2 Recall: retrieve assertion-based memory with evidence.
   *
   * Returns ranked memory blocks (assertions, episodes, conflicts) with
   * evidence quotes linking each assertion back to its source event.
   */
  async recallV2(request: V2RecallRequest): Promise<V2RecallResponse> {
    return this.post<V2RecallResponse>('/v2/recall', request);
  }

  /**
   * V2 Forget: delete assertion-based memory matching the given scope.
   *
   * Returns a receipt with counts of deleted assertions, episodes,
   * entities, conflicts, and extraction failures.
   */
  async forgetV2(request: V2ForgetRequest): Promise<V2ForgetResponse> {
    return this.post<V2ForgetResponse>('/v2/forget', request);
  }

  // -------------------------------------------------------------------------
  // V3 Memory Endpoints (Priority Scoring + Retention + Feedback Loop)
  // -------------------------------------------------------------------------

  /**
   * V3 Ingest: store a memory event with an optional retention policy.
   *
   * retention_policy:
   *   - 'standard'   — normal 30-day grace-period deletion (default)
   *   - 'ephemeral'  — excluded from long-term memory (scratch-pad content)
   *   - 'legal_hold' — protected from deletion until hold is released
   */
  async ingestV3(request: V3IngestRequest): Promise<IngestResponse> {
    return this.post<IngestResponse>('/v3/ingest', request);
  }

  /**
   * V3 Recall: retrieve priority-scored memory with freshness metadata.
   *
   * Response includes recall_id (use with feedbackV3), as_of timestamp,
   * ingestion_lag_seconds, and per-block score breakdowns.
   */
  async recallV3(request: V3RecallRequest): Promise<V3RecallResponse> {
    return this.post<V3RecallResponse>('/v3/recall', request);
  }

  /**
   * V3 Forget: tombstone memory matching the given scope.
   *
   * By default, events are soft-deleted with a 30-day grace period before
   * permanent deletion. Pass immediate: true to skip the grace period.
   * Returns 409 if a legal hold blocks the deletion.
   */
  async forgetV3(request: V3ForgetRequest): Promise<V3ForgetResponse> {
    return this.post<V3ForgetResponse>('/v3/forget', request);
  }

  /**
   * V3 Feedback: record which memory blocks were actually used.
   *
   * Call this after using recalled memory in a response. The fact_ids_used
   * array should contain source_ids from the V3RecallResponse memory blocks
   * that were referenced. This improves future recall scoring via verified_boost.
   */
  async feedbackV3(recallId: string, request: V3FeedbackRequest): Promise<V3FeedbackResponse> {
    return this.post<V3FeedbackResponse>(`/v3/recall/${recallId}/feedback`, request);
  }

  // -------------------------------------------------------------------------
  // V6 Named Methods (preferred — use these for new integrations)
  // -------------------------------------------------------------------------

  /**
   * V6 ingest: store a memory event with optional scope.
   *
   * `conversation_id` is required. It is the stable conversation scope
   * for V6.2 ingest and working-memory behavior.
   * Use `scope` to control fact visibility:
   *   - `'global'`       — visible on all recalls (default)
   *   - `'project'`      — scoped to project_id
   *   - `'conversation'` — scoped to conversation_id only
   */
  async ingestV6(request: V6IngestRequest): Promise<V6IngestResponse> {
    return this.post<V6IngestResponse>('/v6/ingest', request);
  }

  /**
   * V6 recall: retrieve ranked facts plus an LLM-ready context block.
   *
   * `conversation_id` is required. It is the stable conversation scope
   * for history lookup, working memory, pending plans, and scoped recall.
   * Provide `project_id` to include project-scoped facts.
   *
   * Use `result.llm_context.text` directly as your LLM system prompt.
   * Use `result.answer_facts` for structured access to individual facts.
   */
  async recallV6(request: V6RecallRequest): Promise<V6RecallResponse> {
    return this.post<V6RecallResponse>('/v6/recall', request);
  }

  /**
   * V6 feedback: record which recalled facts were actually used.
   *
   * The current V6.2 recall response schema does not expose a public
   * `recall_id`, so this method is not part of the primary integration path.
   */
  async feedbackV6(recallId: string, request: V5FeedbackRequest): Promise<V5FeedbackResponse> {
    return this.post<V5FeedbackResponse>(`/v6/recall/${recallId}/feedback`, request);
  }

  /**
   * Upload a document and parse it into a structured span index.
   *
   * The document is parsed into sections and spans immediately. Distillations
   * (LLM-generated section/document summaries) complete asynchronously — the
   * response status is always `'processing'`. Poll `listDocuments` or
   * `GET /v6/documents/:id/status` to check when the document is `'ready'`.
   *
   * Re-uploading with the same `document_id` replaces the existing document.
   *
   * ```ts
   * const { document_id, spans_created } = await client.uploadDocument({
   *   user_id: 'user_123',
   *   content: fs.readFileSync('report.md', 'utf8'),
   *   document_name: 'Q3 Report',
   *   project_id: 'proj_abc',
   * });
   *
   * // Recall from this specific document:
   * const result = await client.recallV6({ user_id, query, document_id });
   *
   * // Delete the document and all its spans/distillations:
   * await client.deleteDocument(document_id);
   * ```
   */
  async uploadDocument(request: DocumentUploadRequest): Promise<DocumentUploadResponse> {
    return this.post<DocumentUploadResponse>('/v6/documents', request);
  }

  /**
   * List documents for a user, optionally filtered by project or collection.
   */
  async listDocuments(options: {
    user_id: string;
    project_id?: string;
    collection_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<DocumentListResponse> {
    const params: Record<string, string> = { user_id: options.user_id };
    if (options.project_id) params.project_id = options.project_id;
    if (options.collection_id) params.collection_id = options.collection_id;
    if (options.limit !== undefined) params.limit = String(options.limit);
    if (options.offset !== undefined) params.offset = String(options.offset);
    return this.get<DocumentListResponse>('/v6/documents', params);
  }

  /**
   * Delete a document and all its associated spans, distillations, and
   * collection memberships.
   */
  async deleteDocument(documentId: string): Promise<{ deleted: boolean; document_id: string }> {
    return this.delete<{ deleted: boolean; document_id: string }>(`/v6/documents/${documentId}`);
  }

  // -------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------

  /**
   * Create a new document collection.
   *
   * Collections group documents for combined recall queries.
   * Deleting a collection does not delete its documents.
   */
  async createCollection(request: CollectionCreateRequest): Promise<CollectionCreateResponse> {
    return this.post<CollectionCreateResponse>('/v6/collections', request);
  }

  /**
   * List collections for a user, optionally filtered by project.
   */
  async listCollections(options: {
    user_id: string;
    project_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<CollectionListResponse> {
    const params: Record<string, string> = { user_id: options.user_id };
    if (options.project_id) params.project_id = options.project_id;
    if (options.limit !== undefined) params.limit = String(options.limit);
    if (options.offset !== undefined) params.offset = String(options.offset);
    return this.get<CollectionListResponse>('/v6/collections', params);
  }

  /**
   * Get a collection with its document list.
   */
  async getCollection(collectionId: string, userId: string): Promise<CollectionGetResponse> {
    return this.get<CollectionGetResponse>(`/v6/collections/${collectionId}`, { user_id: userId });
  }

  /**
   * Delete a collection. Documents in the collection are NOT deleted.
   */
  async deleteCollection(collectionId: string, userId: string): Promise<{ deleted: boolean; collection_id: string }> {
    return this.delete<{ deleted: boolean; collection_id: string }>(`/v6/collections/${collectionId}?user_id=${encodeURIComponent(userId)}`);
  }

  /**
   * Add a document to a collection.
   */
  async addDocumentToCollection(
    collectionId: string,
    request: CollectionAddDocumentRequest,
  ): Promise<{ added: boolean; collection_id: string; document_id: string }> {
    return this.post<{ added: boolean; collection_id: string; document_id: string }>(
      `/v6/collections/${collectionId}/documents`,
      request,
    );
  }

  /**
   * Remove a document from a collection (does not delete the document).
   */
  async removeDocumentFromCollection(
    collectionId: string,
    documentId: string,
  ): Promise<{ removed: boolean; collection_id: string; document_id: string }> {
    return this.delete<{ removed: boolean; collection_id: string; document_id: string }>(
      `/v6/collections/${collectionId}/documents/${documentId}`,
    );
  }

  // -------------------------------------------------------------------------
  // V5 Aliases (deprecated — prefer ingestV6 / recallV6 / feedbackV6)
  // -------------------------------------------------------------------------

  /** @deprecated Use ingestV6 instead. */
  async ingestV5(request: V5IngestRequest): Promise<V5IngestResponse> {
    return this.post<V5IngestResponse>('/v6/ingest', request);
  }

  /** @deprecated Use recallV6 instead. */
  async recallV5(request: V5RecallRequest): Promise<V5RecallResponse> {
    return this.post<V5RecallResponse>('/v6/recall', request);
  }

  /** @deprecated Use feedbackV6 instead. */
  async feedbackV5(recallId: string, request: V5FeedbackRequest): Promise<V5FeedbackResponse> {
    return this.post<V5FeedbackResponse>(`/v6/recall/${recallId}/feedback`, request);
  }

  // -------------------------------------------------------------------------
  // Usage Endpoints
  // -------------------------------------------------------------------------

  /**
   * Get aggregated usage summary with daily breakdown.
   */
  async getUsageSummary(range: UsageRange = '7d'): Promise<UsageSummaryResponse> {
    return this.get<UsageSummaryResponse>('/v1/usage/summary', { range });
  }

  /**
   * Get usage breakdown by endpoint.
   */
  async getUsageBreakdown(range: UsageRange = '7d'): Promise<UsageBreakdownResponse> {
    return this.get<UsageBreakdownResponse>('/v1/usage/breakdown', { range });
  }

  /**
   * Get current plan limits and quota status.
   */
  async getUsageLimits(): Promise<UsageLimitsResponse> {
    return this.get<UsageLimitsResponse>('/v1/usage/limits');
  }

  // -------------------------------------------------------------------------
  // Deletion Receipts
  // -------------------------------------------------------------------------

  /**
   * List deletion receipts, newest first.
   * Supports filtering by user_id and pagination via limit/offset.
   */
  async listDeletionReceipts(options?: {
    user_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListDeletionReceiptsResponse> {
    const params: Record<string, string> = {};
    if (options?.user_id) params.user_id = options.user_id;
    if (options?.limit !== undefined) params.limit = String(options.limit);
    if (options?.offset !== undefined) params.offset = String(options.offset);
    return this.get<ListDeletionReceiptsResponse>('/v1/deletion-receipts', params);
  }

  /**
   * Get a single deletion receipt by ID.
   */
  async getDeletionReceipt(receiptId: string): Promise<DeletionReceipt> {
    return this.get<DeletionReceipt>(`/v1/deletion-receipts/${receiptId}`);
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * Check if the API is reachable and healthy.
   * Does not require authentication.
   */
  async healthCheck(): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('GET', '/healthz', undefined, false);
  }

  // -------------------------------------------------------------------------
  // Internal HTTP Methods
  // -------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body, true);
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = path;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url = `${path}?${qs}`;
    }
    return this.request<T>('GET', url, undefined, true);
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path, undefined, true);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    auth: boolean,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (auth) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let lastError: ClaivApiError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0 && lastError) {
        const backoff = this.getBackoffMs(attempt, lastError);
        await sleep(backoff);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await this._fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new ClaivTimeoutError(this.timeoutMs);
        }
        throw new ClaivNetworkError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      let errorBody: ApiErrorBody;
      try {
        errorBody = (await response.json()) as ApiErrorBody;
      } catch {
        errorBody = {
          error: {
            code: 'unknown',
            message: response.statusText || `HTTP ${response.status}`,
            request_id: '00000000-0000-0000-0000-000000000000',
          },
        };
      }

      lastError = new ClaivApiError(response.status, errorBody);

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === this.maxRetries) {
        throw lastError;
      }
    }

    // Unreachable, but satisfies TypeScript
    throw lastError;
  }

  private getBackoffMs(attempt: number, error: ClaivApiError): number {
    // Respect Retry-After header for 429 responses (stored in details if present)
    const retryAfter = error.details && typeof error.details === 'object' &&
      'retry_after' in (error.details as Record<string, unknown>)
      ? Number((error.details as Record<string, unknown>).retry_after)
      : undefined;

    if (retryAfter && retryAfter > 0) {
      return Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
    }

    // Exponential backoff with jitter
    const base = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    const jitter = base * 0.5 * Math.random();
    return Math.min(base + jitter, MAX_BACKOFF_MS);
  }
}
