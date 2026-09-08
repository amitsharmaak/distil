import { requestIp, readCookie, readSessionCookie } from "../request";
import { SESSION_COOKIE_NAME } from "../constants";

describe("request trust-boundary parsing", () => {
  it("prefers the first forwarded address, then a direct proxy address, without inventing an identity", () => {
    expect(
      requestIp(
        new Request("https://distil.example", {
          headers: { "x-forwarded-for": " 203.0.113.7, 10.0.0.2 ", "x-real-ip": "198.51.100.4" },
        })
      )
    ).toBe("203.0.113.7");
    expect(
      requestIp(
        new Request("https://distil.example", { headers: { "x-real-ip": " 198.51.100.4 " } })
      )
    ).toBe("198.51.100.4");
    expect(requestIp(new Request("https://distil.example"))).toBe("unknown");
  });

  it("only returns the exact requested cookie and decodes its value", () => {
    const request = new Request("https://distil.example", {
      headers: { cookie: "malformed; other=value; session=hello%20world; empty=" },
    });

    expect(readCookie(request, "session")).toBe("hello world");
    expect(readCookie(request, "missing")).toBeUndefined();
    expect(readCookie(new Request("https://distil.example"), "session")).toBeUndefined();
  });

  it("uses the canonical session-cookie name rather than accepting lookalikes", () => {
    const request = new Request("https://distil.example", {
      headers: { cookie: `${SESSION_COOKIE_NAME}_old=stale; ${SESSION_COOKIE_NAME}=current` },
    });

    expect(readSessionCookie(request)).toBe("current");
  });
});
