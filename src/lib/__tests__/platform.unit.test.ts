/** @jest-environment jsdom */

import { isIosDevice } from "@/lib/platform";

function setNavigator(values: {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
  }
}

const desktopMacUa =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("isIosDevice", () => {
  const original = {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgentData: (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData,
  };

  afterEach(() => setNavigator(original));

  it("detects an iPhone by platform", () => {
    setNavigator({ platform: "iPhone", userAgent: desktopMacUa, maxTouchPoints: 5 });
    expect(isIosDevice()).toBe(true);
  });

  it("detects an iPad that reports itself as a Mac with a touch screen", () => {
    setNavigator({ platform: "MacIntel", userAgent: desktopMacUa, maxTouchPoints: 5 });
    expect(isIosDevice()).toBe(true);
  });

  it("detects iOS browsers that only reveal the device in the user agent", () => {
    setNavigator({
      platform: "",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/118.0 Mobile/15E148",
      maxTouchPoints: 0,
    });
    expect(isIosDevice()).toBe(true);
  });

  it("prefers the client hints platform when present", () => {
    setNavigator({
      platform: "MacIntel",
      userAgent: desktopMacUa,
      maxTouchPoints: 0,
      userAgentData: { platform: "iOS" },
    });
    expect(isIosDevice()).toBe(true);
    setNavigator({ userAgentData: { platform: "iPadOS" } });
    expect(isIosDevice()).toBe(true);
    setNavigator({ userAgentData: { platform: "macOS" } });
    expect(isIosDevice()).toBe(false);
  });

  it("is false on a desktop Mac, Windows and Android", () => {
    setNavigator({ platform: "MacIntel", userAgent: desktopMacUa, maxTouchPoints: 0 });
    expect(isIosDevice()).toBe(false);
    setNavigator({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    expect(isIosDevice()).toBe(false);
    setNavigator({
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36",
      maxTouchPoints: 5,
    });
    expect(isIosDevice()).toBe(false);
  });
});
