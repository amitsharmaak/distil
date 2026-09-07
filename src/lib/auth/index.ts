export { authenticateCaptureToken, resolveCapturePrincipal } from "@/lib/auth/authenticate";
export type {
  CaptureAuthRepositories,
  CapturePrincipalDependencies,
} from "@/lib/auth/authenticate";
export { verifyLegacyCaptureToken } from "@/lib/auth/authenticate";
export { AuthError } from "@/lib/auth/errors";
export { AccessDeniedError } from "@/lib/auth/account";
export type {
  AccountStatus,
  FreshAuthMarker,
  LinkedAccount,
  ResolvedAuthRequest,
} from "@/lib/auth/account";
export type {
  AuthIdentityRepositoryPort,
  AuthRepositoryPort,
  InvitationRecord,
  InvitationRepositoryPort,
} from "@/lib/auth/ports";
