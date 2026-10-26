/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  ReaderExperience,
  ReaderDisplaySettings,
  READER_PREFERENCES_KEY,
} from "../reader-experience";
import { VideoDisclosure } from "../video-embed";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";

jest.mock("next/navigation", () => ({
  usePathname: () => "/feed/one",
  useRouter: () => ({ push: jest.fn() }),
}));

beforeEach(() => localStorage.clear());
function setup() {
  return render(
    <ShortcutsProvider>
      <ReaderExperience>
        <ReaderDisplaySettings />
        <div className="distil-reader">Article text</div>
      </ReaderExperience>
    </ShortcutsProvider>
  );
}

it("persists display settings across remounts and puts variables above dynamically rendered content", () => {
  const first = setup();
  fireEvent.click(screen.getByRole("button", { name: "Reading display settings" }));
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: "Text size" })).getByRole("radio", {
      name: "Large",
    })
  );
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: "Typeface" })).getByRole("radio", {
      name: "Sans",
    })
  );
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: "Line width" })).getByRole("radio", {
      name: "Narrow",
    })
  );
  expect(JSON.parse(localStorage.getItem(READER_PREFERENCES_KEY)!)).toEqual({
    size: "large",
    width: "narrow",
    font: "sans",
  });
  first.unmount();
  const second = setup();
  const root = second.container.querySelector<HTMLElement>(".distil-reader-page")!;
  expect(root.style.getPropertyValue("--reader-font-size")).toBe("1.375rem");
  expect(root.style.getPropertyValue("--reader-line-width")).toBe("54ch");
  expect(root.style.getPropertyValue("--reader-font-family")).toContain("--font-geist-sans");
  expect(root).toContainElement(screen.getByText("Article text"));
});

it("ignores malformed storage values and leaves readable defaults", () => {
  localStorage.setItem(
    READER_PREFERENCES_KEY,
    JSON.stringify({ size: "enormous", width: "100vw", font: "invalid" })
  );
  const { container } = setup();
  expect(
    container
      .querySelector<HTMLElement>(".distil-reader-page")!
      .style.getPropertyValue("--reader-font-size")
  ).toBe("1.1875rem");
  expect(screen.getByRole("progressbar", { name: "Reading progress" })).toHaveAttribute(
    "aria-valuemax",
    "100"
  );
});

it("opens the video with the reader and unloads the player when hidden", () => {
  render(
    <VideoDisclosure
      contentType="video"
      url="https://www.youtube.com/watch?v=example123"
      duration="12:30"
    />
  );
  const control = screen.getByRole("button", { name: /Hide video/ });
  expect(control).toHaveAttribute("aria-expanded", "true");
  const player = screen.getByTitle("YouTube video player");
  expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/example123");
  // The reader page is `no-referrer` for X's CDN; YouTube's player needs the origin or it
  // shows "Error 153", so the embed carries its own policy.
  expect(player).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  fireEvent.click(control);
  expect(screen.queryByTitle("YouTube video player")).not.toBeInTheDocument();
  const reopen = screen.getByRole("button", { name: /Play video/ });
  expect(reopen).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(reopen);
  expect(screen.getByTitle("YouTube video player")).toBeInTheDocument();
});
