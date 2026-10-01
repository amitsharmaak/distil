/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  ReaderExperience,
  ReaderDisplaySettings,
  ReaderHero,
  READER_PREFERENCES_KEY,
} from "../reader-experience";
import { VideoHero } from "../video-embed";
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

it("hides a failed remote hero without collapsing its reserved image box", () => {
  render(<ReaderHero src="https://example.test/image.jpg" title="Article image" />);
  const image = screen.getByRole("img", { name: "Article image" });
  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).toHaveAttribute("decoding", "async");
  expect(image).toHaveAttribute("referrerPolicy", "no-referrer");
  fireEvent.error(image);
  expect(image).not.toBeVisible();
  expect(image.parentElement).toBeVisible();
  expect(image.parentElement).toHaveClass("aspect-[16/9]");
});

it("replaces the captured video poster with one player in the same fixed box", () => {
  const { container } = render(
    <VideoHero
      thumbnailUrl="https://example.test/video.jpg"
      title="A video"
      contentType="video"
      url="https://www.youtube.com/watch?v=example123"
    />
  );
  const box = container.firstElementChild;
  expect(box).toHaveClass("aspect-video");
  expect(screen.getByRole("img", { name: "A video" })).toHaveAttribute(
    "referrerPolicy",
    "no-referrer"
  );
  expect(screen.queryByTitle("YouTube video player")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Play video" }));
  expect(screen.getByTitle("YouTube video player")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/example123"
  );
  expect(screen.queryByRole("img", { name: "A video" })).not.toBeInTheDocument();
  expect(container.firstElementChild).toBe(box);
});
