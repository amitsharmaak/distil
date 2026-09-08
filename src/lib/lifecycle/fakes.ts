import type { AuthAccountPurger, AuthProviderSubject } from "./ports";

export class FakeAuthAccountPurger implements AuthAccountPurger {
  readonly revoked: AuthProviderSubject[] = [];
  readonly deleted: AuthProviderSubject[] = [];
  fail = false;

  async revokeSessions(providerSubject: AuthProviderSubject): Promise<void> {
    if (this.fail) throw new Error("Injected auth purge failure");
    this.revoked.push(providerSubject);
  }

  async deleteIdentity(providerSubject: AuthProviderSubject): Promise<void> {
    if (this.fail) throw new Error("Injected auth purge failure");
    this.deleted.push(providerSubject);
  }
}
