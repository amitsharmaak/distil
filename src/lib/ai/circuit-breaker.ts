/**
 * Circuit breaker for AI provider calls.
 *
 * States: CLOSED (normal) → OPEN (failing, reject calls) → HALF-OPEN (testing)
 *
 * Opens after `failureThreshold` consecutive failures.
 * Stays open for `resetTimeout` ms, then transitions to half-open.
 * In half-open, one call is allowed through — if it succeeds, close; if it fails, re-open.
 *
 * SERVER-SIDE ONLY.
 */

import { aiLogger } from "@/lib/logger";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number; // ms
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailure = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  getState(): CircuitState {
    if (
      this.state === "open" &&
      Date.now() - this.lastFailure >= this.options.resetTimeout
    ) {
      this.state = "half-open";
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === "open") {
      throw new Error(
        `Circuit breaker ${this.options.name} is OPEN — provider unavailable`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "half-open") {
      aiLogger.info(
        { breaker: this.options.name },
        "Circuit breaker closed (recovered)",
      );
    }
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.options.failureThreshold) {
      this.state = "open";
      aiLogger.warn(
        { breaker: this.options.name, failures: this.failures },
        "Circuit breaker opened",
      );
    }
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
  }
}

// Pre-configured breakers per provider
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(provider: string): CircuitBreaker {
  let breaker = breakers.get(provider);
  if (!breaker) {
    breaker = new CircuitBreaker({
      name: provider,
      failureThreshold: 3,
      resetTimeout: 60_000, // 1 minute
    });
    breakers.set(provider, breaker);
  }
  return breaker;
}
