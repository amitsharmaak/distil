import { isIP } from "node:net";
import { lookup as nodeLookup } from "node:dns/promises";

import { normalizeUrl as normalizeExistingUrl } from "@/lib/utils";
import { CaptureProcessingError } from "./errors";

export interface DnsAddress {
  address: string;
  family: number;
}

export type DnsResolver = (hostname: string) => Promise<readonly DnsAddress[]>;

const UNSAFE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

function parseIpv4(address: string): number[] | undefined {
  if (isIP(address) !== 4) return undefined;
  const octets = address.split(".").map(Number);
  return octets.length === 4 ? octets : undefined;
}

function unsafeIpv4(address: string): boolean {
  const value = parseIpv4(address);
  if (!value) return true;
  const [a, b, c] = value;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function expandIpv6(address: string): number[] | undefined {
  const zoneIndex = address.indexOf("%");
  const clean = (zoneIndex === -1 ? address : address.slice(0, zoneIndex)).toLowerCase();
  if (isIP(clean) !== 6) return undefined;

  const halves = clean.split("::");
  if (halves.length > 2) return undefined;
  const parsePart = (part: string): number[] => {
    if (!part) return [];
    const output: number[] = [];
    for (const token of part.split(":")) {
      if (token.includes(".")) {
        const v4 = parseIpv4(token);
        if (!v4) return [];
        output.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        output.push(Number.parseInt(token, 16));
      }
    }
    return output;
  };
  const left = parsePart(halves[0]);
  const right = parsePart(halves[1] ?? "");
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function unsafeIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return true;
  if (groups.every((value) => value === 0)) return true; // unspecified
  if (groups.slice(0, 7).every((value) => value === 0) && groups[7] === 1) return true;
  if (groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff) {
    const mapped = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return unsafeIpv4(mapped);
  }
  if (groups.slice(0, 6).every((value) => value === 0)) return true; // IPv4-compatible/reserved ::/96
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) return true; // translation prefixes
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((value) => value === 0)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // link local fe80::/10
  if ((groups[0] & 0xff00) === 0xff00) return true; // multicast
  if (groups[0] === 0x2001 && groups[1] <= 0x01ff) return true; // IETF special-purpose
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // documentation
  if (groups[0] === 0x2002) return true; // 6to4 can encode an unsafe IPv4 target
  return false;
}

export function isUnsafeAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, ""));
  if (family === 4) return unsafeIpv4(address);
  if (family === 6) return unsafeIpv6(address.replace(/^\[|\]$/g, ""));
  return true;
}

export async function defaultDnsResolver(hostname: string): Promise<readonly DnsAddress[]> {
  return nodeLookup(hostname, { all: true, verbatim: true });
}

export function normalizeCaptureUrl(raw: string): string {
  const parsed = parseCaptureUrl(raw);
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return normalizeExistingUrl(parsed.toString());
}

function parseCaptureUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch (cause) {
    throw new CaptureProcessingError("UNSAFE_URL", "A valid HTTP(S) URL is required", "rejected", {
      cause,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CaptureProcessingError("UNSAFE_URL", "Only HTTP(S) URLs are supported", "rejected");
  }
  if (url.username || url.password) {
    throw new CaptureProcessingError(
      "UNSAFE_URL",
      "URLs containing credentials are not allowed",
      "rejected"
    );
  }
  if (!url.hostname) {
    throw new CaptureProcessingError("UNSAFE_URL", "The URL must include a hostname", "rejected");
  }
  return url;
}

export async function assertSafeUrl(
  raw: string,
  resolve: DnsResolver = defaultDnsResolver
): Promise<URL> {
  const url = parseCaptureUrl(raw);
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (
    UNSAFE_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new CaptureProcessingError(
      "UNSAFE_URL",
      "Private network targets are not allowed",
      "rejected"
    );
  }

  const family = isIP(hostname);
  let addresses: readonly DnsAddress[];
  try {
    addresses = family ? [{ address: hostname, family }] : await resolve(hostname);
  } catch (cause) {
    throw new CaptureProcessingError(
      "UNSAFE_URL",
      "The target hostname could not be verified",
      "rejected",
      {
        cause,
      }
    );
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new CaptureProcessingError(
      "UNSAFE_URL",
      "Private or reserved network targets are not allowed",
      "rejected"
    );
  }
  return url;
}
