import { CaptureProcessingError } from "../errors";
import { assertSafeUrl, isUnsafeAddress, normalizeCaptureUrl } from "../url-safety";
import { publicDns } from "./fixtures";

describe("capture URL safety", () => {
  test.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::2",
    "64:ff9b::1",
    "100::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2001:100::1",
    "2002:7f00:1::",
  ])("rejects private or reserved address %s", (address) => {
    expect(isUnsafeAddress(address)).toBe(true);
  });

  test.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2606:4700:4700:0:0:0:0:1111"])(
    "accepts public address %s",
    (address) => expect(isUnsafeAddress(address)).toBe(false)
  );

  test.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://user:password@example.com",
    "http://localhost/admin",
    "http://service.local/",
    "http://metadata.internal/",
    "not a url",
  ])("rejects unsafe target %s", async (url) => {
    await expect(assertSafeUrl(url, publicDns)).rejects.toMatchObject({ code: "UNSAFE_URL" });
  });

  it("rejects a public hostname when any DNS answer is private", async () => {
    await expect(
      assertSafeUrl("https://example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ])
    ).rejects.toBeInstanceOf(CaptureProcessingError);
  });

  it("rejects a hostname with no DNS answers", async () => {
    await expect(assertSafeUrl("https://example.com", async () => [])).rejects.toMatchObject({
      code: "UNSAFE_URL",
    });
  });

  it("rejects a hostname whose DNS lookup cannot be verified", async () => {
    await expect(
      assertSafeUrl("https://example.com", async () => {
        throw new Error("resolver unavailable");
      })
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
  });

  it("normalizes tracking parameters, fragment, host, and www for deduplication", () => {
    expect(normalizeCaptureUrl(" HTTPS://WWW.Example.com/story/?utm_source=x&b=2&a=1#part ")).toBe(
      "https://example.com/story?a=1&b=2"
    );
    expect(normalizeCaptureUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("rejects a zone-qualified link-local IPv6 address", () => {
    expect(isUnsafeAddress("fe80::1%lo0")).toBe(true);
  });
});
