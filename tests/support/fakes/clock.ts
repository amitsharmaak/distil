export interface TestClock {
  now(): Date;
  nowMs(): number;
  sleep(milliseconds: number): Promise<void>;
}

/** A clock whose sleep advances immediately, keeping retry tests wall-clock free. */
export class FakeClock implements TestClock {
  private currentTimeMs: number;

  constructor(initialTime: string | number | Date = "2026-01-15T10:00:00.000Z") {
    this.currentTimeMs = new Date(initialTime).getTime();
    if (Number.isNaN(this.currentTimeMs)) {
      throw new RangeError("FakeClock requires a valid initial time");
    }
  }

  now(): Date {
    return new Date(this.currentTimeMs);
  }

  nowMs(): number {
    return this.currentTimeMs;
  }

  set(time: string | number | Date): void {
    const milliseconds = new Date(time).getTime();
    if (Number.isNaN(milliseconds)) {
      throw new RangeError("FakeClock requires a valid time");
    }
    this.currentTimeMs = milliseconds;
  }

  advanceBy(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("FakeClock can only advance by a non-negative duration");
    }
    this.currentTimeMs += milliseconds;
  }

  async sleep(milliseconds: number): Promise<void> {
    this.advanceBy(milliseconds);
  }
}
