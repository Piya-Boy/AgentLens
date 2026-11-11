/** A document edit by the user this recently means opening another file could swallow their keystrokes. */
export const TYPING_GRACE_MS = 3000;

export class TypingTracker {
  private lastTypedAt: number | undefined;

  constructor(
    private readonly graceMs: number = TYPING_GRACE_MS,
    private readonly now: () => number = Date.now,
  ) {}

  recordTyping(): void {
    this.lastTypedAt = this.now();
  }

  isBusy(): boolean {
    return this.lastTypedAt !== undefined && this.now() - this.lastTypedAt < this.graceMs;
  }
}
