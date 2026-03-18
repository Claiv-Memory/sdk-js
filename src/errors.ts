import type { ApiErrorBody } from './types.js';

/**
 * Base error for all Claiv SDK errors.
 */
export class ClaivError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaivError';
  }
}

/**
 * Thrown when the API returns an error response (4xx / 5xx).
 */
export class ClaivApiError extends ClaivError {
  /** HTTP status code */
  readonly status: number;
  /** Machine-readable error code from the API */
  readonly code: string;
  /** Server-assigned request ID for support tickets */
  readonly requestId: string;
  /** Optional extra details (e.g. validation errors, quota info) */
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ClaivApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.request_id;
    this.details = body.error.details;
  }
}

/**
 * Thrown when a request times out.
 */
export class ClaivTimeoutError extends ClaivError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'ClaivTimeoutError';
  }
}

/**
 * Thrown when a network-level error occurs (DNS failure, connection refused, etc.).
 */
export class ClaivNetworkError extends ClaivError {
  readonly cause: Error;

  constructor(cause: Error) {
    super(`Network error: ${cause.message}`);
    this.name = 'ClaivNetworkError';
    this.cause = cause;
  }
}
