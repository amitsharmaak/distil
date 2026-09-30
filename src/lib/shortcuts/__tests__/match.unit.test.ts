/** @jest-environment jsdom */
import { eventToKey, isEditableTarget, isMacPlatform, keyEquals } from "../match";

function setPlatform(value: string) {
  Object.defineProperty(window.navigator, "platform", { value, configurable: true });
}

function ev(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { cancelable: true, ...init });
}

describe("eventToKey", () => {
  beforeEach(() => setPlatform("Win32"));

  it("lowercases letters and carries shift", () => {
    expect(eventToKey(ev({ key: "t", code: "KeyT" }))).toEqual({ key: "t", shift: false });
    expect(eventToKey(ev({ key: "T", code: "KeyT", shiftKey: true }))).toEqual({
      key: "t",
      shift: true,
    });
  });

  it("uses code for punctuation on non-US layouts", () => {
    expect(eventToKey(ev({ key: "ß", code: "Slash" }))).toEqual({ key: "/" });
    expect(eventToKey(ev({ key: "_", code: "Slash", shiftKey: true }))).toEqual({ key: "?" });
    expect(eventToKey(ev({ key: "[", code: "BracketLeft" }))).toEqual({ key: "[" });
  });

  it("keeps named keys verbatim", () => {
    expect(eventToKey(ev({ key: "Escape", code: "Escape" }))).toEqual({
      key: "Escape",
      shift: false,
    });
  });

  it("maps Ctrl to mod on non-mac and rejects Meta", () => {
    expect(isMacPlatform()).toBe(false);
    expect(eventToKey(ev({ key: "r", code: "KeyR", ctrlKey: true }))?.mod).toBe(true);
    expect(eventToKey(ev({ key: "r", code: "KeyR", metaKey: true }))).toBeNull();
  });

  it("maps Cmd to mod on mac and rejects Ctrl", () => {
    setPlatform("MacIntel");
    expect(eventToKey(ev({ key: "r", code: "KeyR", metaKey: true }))).toEqual({
      key: "r",
      shift: false,
      mod: true,
    });
    expect(eventToKey(ev({ key: "r", code: "KeyR", ctrlKey: true }))).toBeNull();
  });

  it("returns null for Alt combos", () => {
    expect(eventToKey(ev({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }))).toBeNull();
  });

  it("returns null while composing or already handled", () => {
    expect(eventToKey(ev({ key: "a", code: "KeyA", isComposing: true }))).toBeNull();
    const handled = ev({ key: "a", code: "KeyA" });
    handled.preventDefault();
    expect(eventToKey(handled)).toBeNull();
  });

  it("returns null for bare modifier keys", () => {
    expect(eventToKey(ev({ key: "Shift", code: "ShiftLeft", shiftKey: true }))).toBeNull();
  });
});

describe("keyEquals", () => {
  it("treats missing flags as false", () => {
    expect(keyEquals({ key: "t" }, { key: "t", shift: false, mod: false })).toBe(true);
    expect(keyEquals({ key: "t" }, { key: "t", shift: true })).toBe(false);
    expect(keyEquals({ key: "t" }, { key: "t", mod: true })).toBe(false);
  });
});

describe("isEditableTarget", () => {
  const make = (html: string) => {
    document.body.innerHTML = html;
    return document.body.firstElementChild as HTMLElement;
  };

  it("is true for text inputs, textarea, select and textbox roles", () => {
    expect(isEditableTarget(make('<input type="text" />'))).toBe(true);
    expect(isEditableTarget(make("<input />"))).toBe(true);
    expect(isEditableTarget(make("<textarea></textarea>"))).toBe(true);
    expect(isEditableTarget(make("<select></select>"))).toBe(true);
    expect(isEditableTarget(make('<div role="textbox"><span id="c"></span></div>'))).toBe(true);
    expect(isEditableTarget(document.getElementById("c"))).toBe(true);
  });

  it("is true for contenteditable and descendants", () => {
    const el = make('<div contenteditable="true"><b id="c">x</b></div>');
    expect(isEditableTarget(el)).toBe(true);
    expect(isEditableTarget(document.getElementById("c"))).toBe(true);
  });

  it("is false for button-like inputs, plain elements and null", () => {
    for (const t of ["button", "submit", "checkbox", "radio", "range", "file", "color"]) {
      expect(isEditableTarget(make(`<input type="${t}" />`))).toBe(false);
    }
    expect(isEditableTarget(make("<div></div>"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});
