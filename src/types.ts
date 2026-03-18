/**
 * TypeScript types matching the Claiv Memory API contracts exactly.
 *
 * These mirror the Zod schemas in @claiv/shared without importing them,
 * so the SDK has zero dependency on internal packages.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export type EventType = 'message' | 'tool_call' | 'app_event';

export type EventRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Controls the visibility of an ingested fact.
 *
 * - `'global'`       — visible on all recalls for this user (default)
 * - `'project'`      — visible only within the same project_id
 * - `'conversation'` — visible only within the same conversation_id
 */
export type MemoryScope = 'global' | 'project' | 'conversation';

export type MemoryBlockType = 'open_loop' | 'fact' | 'claim' | 'episode' | 'chunk' | 'contradiction';

export type UsageRange = '7d' | '30d' | 'month' | 'today';

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export interface IngestRequest {
  user_id: string;
  /**
   * Stable conversation identifier. Required.
   */
  conversation_id: string;
  /** Project identifier. Provide when scope is `'project'`. */
  project_id?: string;
  /** Stable document identifier. All facts from this event are tagged to this document. */
  document_id?: string;
  /** Human-readable document name used in citations. */
  document_name?: string;
  /** Memory visibility scope. Defaults to `'global'`. */
  scope?: MemoryScope;
  type: EventType;
  role?: EventRole;
  content: string;
  metadata?: Record<string, unknown>;
  /** ISO datetime string or Unix timestamp (seconds). Normalized to UTC on ingest. */
  event_time?: string | number;
  idempotency_key?: string;
}

export interface IngestResponse {
  event_id: string;
  deduped: boolean;
}

// ---------------------------------------------------------------------------
// Recall (V6)
// ---------------------------------------------------------------------------

export interface RecallRequest {
  user_id: string;
  /**
   * Stable conversation identifier. Required.
   */
  conversation_id: string;
  /** Project identifier. Enables project-scoped fact retrieval. */
  project_id?: string;
  /** Limit recall to facts extracted from a specific document. */
  document_id?: string;
  query: string;
  reference_time?: string | null;
  mode_hint?: string | null;
  limits?: {
    answer_facts?: number;
    supporting_facts?: number;
    background_facts?: number;
    max_list_items?: number;
    /** Max document chunks to inject into llm_context (semantic mode). Default: 5. */
    document_chunks?: number;
  };
  include?: {
    /** Include active pending plan in the response. Default: true. */
    pending_plan?: boolean;
    /** Include detailed routing/scoring debug info. Default: false. */
    debug?: boolean;
  };
}

export interface V6TemporalMatch {
  ts_start: string;
  ts_end: string | null;
  raw_expression?: string | null;
  anchor_time?: string | null;
  date_type: string;
  granularity: string;
}

export interface RecallFact {
  fact_id: string;
  subject: string;
  kind: string;
  predicate: string;
  object: unknown;
  object_text: string;
  relation_phrase?: string | null;
  source_text?: string | null;
  confidence?: number | null;
  importance?: number | null;
  created_at: string;
  temporal_matches: V6TemporalMatch[];
  /** Set when this fact was extracted from a document. Use for citations. */
  document_id?: string | null;
  document_name?: string | null;
}

export interface V6LLMContext {
  reference_time: string | null;
  anchor_source: 'request' | 'conversation_event' | 'server_now';
  conversation_history: Array<{
    role: string | null;
    content: string;
    event_time: string | null;
  }>;
  fact_ids: string[];
  /** Pre-synthesized narrative ready to inject into your LLM system prompt. */
  text: string;
}

/** Current conversation state returned by the API. */
export interface WorkingMemory {
  focus: {
    entities: string[];
    last_subjects: string[];
    last_constraints: Record<string, unknown>;
  };
  pending_confirmation: {
    plan_id: string;
    detected_at: string;
  } | null;
  last_plan: {
    plan_id: string;
    status: string;
    expires_at: string | null;
  } | null;
  turn_summary: string | null;
}

/** An active multi-step plan awaiting user confirmation. */
export interface PendingPlan {
  plan_id: string;
  conversation_id: string;
  status: string;
  steps: unknown[];
  requires_confirmation: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface RecallResponse {
  /** Facts directly answering the query. */
  answer_facts: RecallFact[];
  /** Corroborating facts providing supporting evidence. */
  supporting_facts: RecallFact[];
  /** Broader background facts from the user's memory. */
  background_context: RecallFact[];
  /** Pre-built LLM context. Use `llm_context.text` as your system prompt. */
  llm_context: V6LLMContext;
  /** Current conversation state returned by the API. */
  working_memory: WorkingMemory | null;
  /** Active plan awaiting confirmation. Populated when pending_plan is requested. */
  pending_plan: PendingPlan | null;
  routing: {
    mode: string;
    kinds: string[];
    predicates: string[];
    temporal_intent: unknown | null;
  };
  debug?: Record<string, unknown>;
}

export type ContextPack = RecallResponse;

/** @deprecated Retained for legacy compatibility only */
export interface MemoryBlock {
  type: MemoryBlockType;
  content: string;
  source_ids: string[];
  score: number;
}

// ---------------------------------------------------------------------------
// Forget
// ---------------------------------------------------------------------------

export interface ForgetRequest {
  user_id: string;
  /** Limit deletion to a specific conversation. */
  conversation_id?: string;
  /** Limit deletion to a specific project. */
  project_id?: string;
  /** Limit deletion to facts from a specific document. */
  document_id?: string;
  from_time?: string;
  to_time?: string;
  /** @deprecated Use conversation_id instead. */
  thread_id?: string;
}

// ---------------------------------------------------------------------------
// Document upload
// ---------------------------------------------------------------------------

export interface DocumentUploadRequest {
  user_id: string;
  /** Plain text or markdown content of the document. */
  content: string;
  /** Human-readable name, used in citations (e.g. 'Q3 Report.pdf'). */
  document_name: string;
  /**
   * Stable opaque ID for this document. If omitted the server generates one.
   * Re-uploading with the same ID replaces the existing document in full.
   */
  document_id?: string;
  /** Project this document belongs to. Required. */
  project_id: string;
  /** Optionally add the document to a collection on upload. */
  collection_id?: string;
  /** Position within the collection (for ordered collections). */
  position?: number;
}

export interface DocumentUploadSection {
  node_id: string;
  title: string | null;
}

export interface DocumentUploadResponse {
  document_id: string;
  document_name: string;
  project_id: string;
  collection_id: string | null;
  sections: DocumentUploadSection[];
  spans_created: number;
  /** Always `'processing'` — distillations complete asynchronously. */
  status: 'processing';
}

// ---------------------------------------------------------------------------
// Document listing
// ---------------------------------------------------------------------------

export interface DocumentStatusInfo {
  status: 'processing' | 'ready' | 'error';
  spans_created: number;
  error_message: string | null;
}

export interface DocumentListItem {
  document_id: string;
  document_name: string;
  project_id: string;
  user_id: string;
  byte_size: number | null;
  created_at: string;
  collection_ids: string[];
  document_status: DocumentStatusInfo | null;
}

export interface DocumentListResponse {
  documents: DocumentListItem[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface CollectionCreateRequest {
  user_id: string;
  project_id: string;
  name: string;
  /** Whether documents in this collection have a meaningful order. Default: false. */
  ordered?: boolean;
  /** Stable opaque ID. If omitted the server generates one. */
  collection_id?: string;
}

export interface CollectionRow {
  collection_id: string;
  tenant_id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  ordered: boolean;
  created_at: string;
  document_count: number;
}

export interface CollectionCreateResponse {
  collection: CollectionRow;
}

export interface CollectionListResponse {
  collections: CollectionRow[];
}

export interface CollectionGetResponse {
  collection: CollectionRow;
  documents: Array<{
    document_id: string;
    document_name: string;
    position: number | null;
    added_at: string;
  }>;
}

export interface CollectionAddDocumentRequest {
  document_id: string;
  user_id: string;
  position?: number;
}

export interface DeletedCounts {
  events: number;
  chunks: number;
  episodes: number;
  facts: number;
  claims: number;
  open_loops: number;
}

export interface ForgetResponse {
  receipt_id: string;
  deleted_counts: DeletedCounts;
}

// ---------------------------------------------------------------------------
// Deletion Receipts
// ---------------------------------------------------------------------------

export interface DeletionScope {
  user_id: string;
  conversation_id?: string | null;
  project_id?: string | null;
  from_time?: string | null;
  to_time?: string | null;
  /** @deprecated */
  thread_id?: string | null;
}

export interface DeletionReceipt {
  receipt_id: string;
  scope: DeletionScope;
  requested_at: string;
  completed_at: string | null;
  deleted_counts: DeletedCounts;
}

export interface ListDeletionReceiptsResponse {
  receipts: DeletionReceipt[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageTotals {
  requests: number;
  ingest_requests: number;
  recall_requests: number;
  forget_requests: number;
  ingest_events: number;
  tokens: number;
  work_units: number;
  errors: number;
  request_bytes: number;
  response_bytes: number;
}

export interface UsageDailyEntry {
  date: string;
  requests: number;
  ingest_events: number;
  tokens: number;
  work_units: number;
  errors: number;
}

export interface UsageSummaryResponse {
  range: string;
  start_date: string;
  end_date: string;
  totals: UsageTotals;
  daily: UsageDailyEntry[];
}

export interface EndpointBreakdownEntry {
  endpoint: string;
  requests: number;
  errors: number;
  error_rate: number;
  avg_latency_ms: number;
}

export interface UsageBreakdownResponse {
  range: string;
  start_date: string;
  end_date: string;
  endpoints: EndpointBreakdownEntry[];
}

export interface UsageLimitMetric {
  used: number;
  limit: number | null;
  remaining: number | null;
  percentage_used: number;
}

export interface UsageLimitsResponse {
  plan: string;
  billing_cycle_day: number;
  reset_date: string;
  is_within_quota: boolean;
  limits: {
    requests: UsageLimitMetric;
    tokens: UsageLimitMetric;
    work_units: UsageLimitMetric;
    ingest_events: UsageLimitMetric;
  };
}

// ---------------------------------------------------------------------------
// V2 Types (assertion-based memory)
// ---------------------------------------------------------------------------

export type V2MemoryBlockType = 'assertion' | 'episode' | 'conflict';

export interface V2EvidenceRef {
  event_id: string;
  quote: string;
}

export interface V2MemoryBlock {
  type: V2MemoryBlockType;
  content: string;
  source_ids: string[];
  evidence?: V2EvidenceRef[];
  score: number;
}

export interface V2RecallRequest {
  user_id: string;
  thread_id?: string;
  task: string;
  token_budget: number;
  min_confidence?: number;
}

export interface V2RecallResponse {
  system_context: string;
  memory_blocks: V2MemoryBlock[];
  citations: string[];
  token_estimate: number;
}

export interface V2ForgetRequest {
  user_id: string;
  thread_id?: string;
  from_time?: string;
  to_time?: string;
}

export interface V2DeletedCounts {
  events: number;
  assertions: number;
  episodes: number;
  entities: number;
  conflicts: number;
  extraction_failures: number;
}

export interface V2ForgetResponse {
  receipt_id: string;
  deleted_counts: V2DeletedCounts;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// V2.1 Types (Production-Grade Memory Extensions)
// ---------------------------------------------------------------------------

export type IntentMode = 'state' | 'delta' | 'tasks' | 'audit' | 'compose' | 'conversation';
export type EpistemicType = 'fact' | 'aspiration' | 'belief' | 'hypothetical' | 'proposal';
export type Cardinality = 'single' | 'set' | 'task_keyed' | 'proposal';
export type ConflictStrategy = 'supersede' | 'merge' | 'conflict' | 'ignore';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type ChangeType = 'create' | 'update' | 'delete' | 'correct' | 'negate';
export type LinkType = 'supersedes' | 'derived_from' | 'conflicts_with' | 'resolves' | 'corrects' | 'negates';

export interface RelationPolicy {
  relation: string;
  cardinality: Cardinality;
  conflict_strategy: ConflictStrategy;
  requires_confirmation: boolean;
  supports_negation: boolean;
  temporal_scoped: boolean;
}

export interface Proposal {
  proposal_id: string;
  tenant_id: string;
  user_id: string;
  thread_id: string | null;
  relation: string;
  subject_entity_id: string | null;
  subject_display: string;
  proposed_object: unknown;
  qualifiers: Record<string, unknown>;
  confidence: number;
  status: ProposalStatus;
  source_event_id: string;
  accepted_event_id: string | null;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ChangeEvent {
  change_id: string;
  tenant_id: string;
  user_id: string;
  thread_id: string | null;
  relation: string;
  subject_entity_id: string | null;
  subject_display: string;
  old_assertion_id: string | null;
  new_assertion_id: string | null;
  change_type: ChangeType;
  old_value: unknown;
  new_value: unknown;
  trigger_event_id: string;
  created_at: string;
}

export interface AssertionLink {
  link_id: string;
  from_assertion_id: string;
  to_assertion_id: string;
  link_type: LinkType;
  created_at: string;
}

// Extended V2 Recall Request with V2.1 mode support
export interface V2RecallRequestExtended extends V2RecallRequest {
  mode?: IntentMode;
  since?: string; // ISO date for delta mode
  relations?: string[]; // Filter by specific relations
  status?: 'open' | 'completed' | 'all'; // For tasks mode
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------
// V3 Types (Priority Memory with Retention Policy + Feedback Loop)
// ---------------------------------------------------------------------------

export type RetentionPolicy = 'standard' | 'legal_hold' | 'ephemeral';

export type EntityResolutionMode = 'merged' | 'probabilistic' | 'raw';

export interface V3IngestRequest extends Omit<IngestRequest, never> {
  user_id: string;
  thread_id?: string;
  type: EventType;
  role?: EventRole;
  content: string;
  metadata?: Record<string, unknown>;
  event_time?: string;
  idempotency_key?: string;
  retention_policy?: RetentionPolicy;
}

export type V3MemoryBlockType = 'fact' | 'task' | 'change' | 'episode' | 'conflict' | 'raw_message';

export interface V3ScoreBreakdown {
  type_weight: number;
  relevance: number;
  recency: number;
  confidence: number;
  frequency: number;
  verified_boost: number;
  intent_match: number;
  thread_boost: number;
  final_score: number;
}

export interface V3MemoryBlock {
  type: V3MemoryBlockType;
  content: string;
  source_ids: string[];
  evidence?: V2EvidenceRef[];
  score: number;
  score_breakdown?: V3ScoreBreakdown;
}

export interface V3RecallRequest {
  user_id: string;
  thread_id?: string;
  task: string;
  token_budget: number;
  min_confidence?: number;
  entity_resolution?: EntityResolutionMode;
}

export interface V3RecallResponse {
  recall_id: string;
  as_of: string;
  system_context: string;
  memory_blocks: V3MemoryBlock[];
  citations: string[];
  token_estimate: number;
  ingestion_lag_seconds: number;
  stale_warning?: string;
}

export interface V3ForgetRequest {
  user_id: string;
  thread_id?: string;
  from_time?: string;
  to_time?: string;
  immediate?: boolean;
}

export interface V3ForgetResponse {
  receipt_id: string;
  audit_id: string;
  phase: string;
  events_tombstoned: number;
  grace_expires_at?: string;
}

export interface V3FeedbackRequest {
  fact_ids_used: string[];
}

export interface V3FeedbackResponse {
  recall_id: string;
  facts_recorded: number;
}

// ---------------------------------------------------------------------------
// V5 Types (Clean-slate memory with tiered storage + temporal graph)
// ---------------------------------------------------------------------------

export type V5MemoryOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'MERGE' | 'NOOP';

export type V5MemoryTier = 'hot' | 'warm' | 'cold';

export type V5MemoryStatus = 'active' | 'superseded' | 'deleted';

export interface V5IngestRequest {
  user_id: string;
  thread_id?: string;
  type: EventType;
  role?: EventRole;
  content: string;
  metadata?: Record<string, unknown>;
  /** ISO datetime string or Unix timestamp (seconds). Normalized to UTC on ingest. */
  event_time?: string | number;
  idempotency_key?: string;
}

export interface V5IngestResponse {
  event_id: string;
  deduped: boolean;
}

export interface V5RecallRequest {
  user_id: string;
  thread_id?: string;
  query: string;
  token_budget?: number;
  include_history?: boolean;
  include_cold?: boolean;
  raw_facts?: boolean;
}

export interface V5TemporalEdge {
  edge_id: string;
  from_fact_id: string;
  to_fact_id: string | null;
  change_type: 'update' | 'delete' | 'merge';
  valid_from: string;
  valid_to: string | null;
}

export interface V5EvidenceRef {
  event_id: string;
  source_text: string;
}

export interface V5MemoryBlock {
  fact_id: string;
  subject: string;
  relation: string;
  object: unknown;
  object_category: string | null;
  memory_type: string | null;
  importance_score: number;
  tier: V5MemoryTier;
  content: string;
  evidence?: V5EvidenceRef[];
  temporal_history?: V5TemporalEdge[];
}

export interface V5RecallResponse {
  recall_id: string;
  answer: string;
  selected_ids: string[];
  memory_blocks: V5MemoryBlock[];
  token_estimate: number;
  as_of: string;
}

export interface V5FeedbackRequest {
  selected_ids: string[];
  user_rating?: number;
}

export interface V5FeedbackResponse {
  recall_id: string;
  facts_recorded: number;
}

// ---------------------------------------------------------------------------
// Client Options
// ---------------------------------------------------------------------------

export interface ClaivClientOptions {
  /** API key for authentication (sent as Bearer token). */
  apiKey: string;
  /** Base URL of the Claiv Memory API. Defaults to https://api.claiv.io */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Maximum number of retries on 429 and 5xx errors. Set to 0 to disable. Defaults to 2. */
  maxRetries?: number;
  /** Custom fetch implementation. Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}
