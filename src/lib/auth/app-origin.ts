export function readApplicationOrigin(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  const configured = environment.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) throw new Error("Application origin is not configured");
  const url = new URL(configured);
  const localDevelopment =
    environment.NODE_ENV !== "production" && url.origin === "http://localhost:3000";
  if (url.protocol !== "https:" && !localDevelopment)
    throw new Error("Application origin must use HTTPS");
  return url.origin;
}
