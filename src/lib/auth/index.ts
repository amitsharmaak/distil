export { authenticateCaptureToken, resolveCapturePrincipal } from "@/lib/auth/authenticate";
export type { CapturePrincipalDependencies } from "@/lib/auth/authenticate";
export { PostgresCaptureTokenIdentityResolver } from "@/lib/auth/capture-token-identity";
export type {
  CaptureTokenIdentity,
  CaptureTokenIdentityResolver,
} from "@/lib/auth/capture-token-identity";
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
