export class AuthRepositoryUnavailableError extends Error {
  constructor() {
    super("Authentication repositories are unavailable");
    this.name = "AuthRepositoryUnavailableError";
  }
}
