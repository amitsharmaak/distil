/** Produces valid, stable version-4 UUIDs without random input. */
export class FakeUuidGenerator {
  private sequence: number;

  constructor(initialSequence = 1) {
    if (
      !Number.isSafeInteger(initialSequence) ||
      initialSequence < 0 ||
      initialSequence > 999_999_999_999
    ) {
      throw new RangeError("UUID sequence must fit in twelve decimal digits");
    }
    this.sequence = initialSequence;
  }

  next = (): string => {
    const suffix = this.sequence.toString().padStart(12, "0");
    this.sequence += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };

  reset(sequence = 1): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 999_999_999_999) {
      throw new RangeError("UUID sequence must fit in twelve decimal digits");
    }
    this.sequence = sequence;
  }
}
