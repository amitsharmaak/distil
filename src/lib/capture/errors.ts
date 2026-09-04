export type CaptureFailureKind = "transient" | "terminal" | "rejected";

export class CaptureProcessingError extends Error {
  readonly code: string;
  readonly kind: CaptureFailureKind;

  constructor(code: string, message: string, kind: CaptureFailureKind, options?: ErrorOptions) {
    super(message, options);
    this.name = "CaptureProcessingError";
    this.code = code;
    this.kind = kind;
  }
}

export class CaptureRetryScheduledError extends Error {
  readonly captureId: string;

  constructor(captureId: string, options?: ErrorOptions) {
    super(`Capture ${captureId} is queued for retry`, options);
    this.name = "CaptureRetryScheduledError";
    this.captureId = captureId;
  }
}

export function processingError(error: unknown): CaptureProcessingError {
  if (error instanceof CaptureProcessingError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new CaptureProcessingError("UPSTREAM_TIMEOUT", "The source timed out", "transient", {
      cause: error,
    });
  }
  return new CaptureProcessingError(
    "UPSTREAM_UNAVAILABLE",
    error instanceof Error ? error.message : "The source could not be reached",
    "transient",
    { cause: error }
  );
}
