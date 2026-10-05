/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import { VideoDisclosure } from "../video-embed";

const X_POST = "https://x.com/someone/status/1";
const NATIVE_MP4 = "https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/clip.mp4?tag=29";

describe("VideoDisclosure with a captured X video", () => {
  it("plays the native MP4 once the reader asks for the video", () => {
    render(<VideoDisclosure url={X_POST} contentType="video" nativeVideoUrl={NATIVE_MP4} />);

    expect(document.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /play video/i }));

    const player = document.querySelector("video");
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute("src", NATIVE_MP4);
  });

  it("falls back to an Open on X link when the MP4 cannot be loaded", () => {
    render(<VideoDisclosure url={X_POST} contentType="video" nativeVideoUrl={NATIVE_MP4} />);
    fireEvent.click(screen.getByRole("button", { name: /play video/i }));

    fireEvent.error(document.querySelector("video")!);

    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("link", { name: /open on x/i })).toHaveAttribute("href", X_POST);
  });
});
