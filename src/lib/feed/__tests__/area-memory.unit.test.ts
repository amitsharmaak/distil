/**
 * @jest-environment jsdom
 */

import { FEED_AREA_STORAGE_KEY, readRememberedArea, rememberArea } from "../area-memory";

beforeEach(() => {
  window.localStorage.clear();
});

describe("Feed area memory", () => {
  it("uses the distil. key prefix", () => {
    expect(FEED_AREA_STORAGE_KEY).toMatch(/^distil\./);
  });

  it("remembers a chosen area and forgets it for All", () => {
    expect(readRememberedArea()).toBeUndefined();
    rememberArea("work");
    expect(window.localStorage.getItem(FEED_AREA_STORAGE_KEY)).toBe("work");
    expect(readRememberedArea()).toBe("work");
    rememberArea(undefined);
    expect(window.localStorage.getItem(FEED_AREA_STORAGE_KEY)).toBeNull();
    expect(readRememberedArea()).toBeUndefined();
  });

  it("ignores a stored value that is not one of the four areas", () => {
    window.localStorage.setItem(FEED_AREA_STORAGE_KEY, "fun");
    expect(readRememberedArea()).toBeUndefined();
  });

  it("treats unavailable storage as no memory and never throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(() => rememberArea("personal")).not.toThrow();
      expect(readRememberedArea()).toBeUndefined();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
