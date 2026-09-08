import type { UserId } from "@/lib/contracts";
import type { AuthAccountPurger } from "./ports";

export class FakeAuthAccountPurger implements AuthAccountPurger {
  readonly revoked: UserId[] = [];
  readonly deleted: UserId[] = [];
  fail = false;

  async revokeSessions(userId: UserId): Promise<void> {
    if (this.fail) throw new Error("Injected auth purge failure");
    this.revoked.push(userId);
  }

  async deleteIdentity(userId: UserId): Promise<void> {
    if (this.fail) throw new Error("Injected auth purge failure");
    this.deleted.push(userId);
  }
}
