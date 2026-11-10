import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Hero from "@/components/storefront/Hero";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderHero() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Hero />
    </MemoryRouter>,
  );
}

describe("hero background video", () => {
  it("uses muted, inline, looping autoplay with a poster fallback", () => {
    const { container } = renderHero();
    const video = container.querySelector("video");

    expect(video).toHaveProperty("autoplay", true);
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveProperty("loop", true);
    expect(video).toHaveProperty("playsInline", true);
    expect(video).toHaveAttribute("poster");
    expect(video?.querySelector("source")).toHaveAttribute("src", "/videos/hero.mp4");
  });

  it("retries playback when the video can play", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = renderHero();

    await act(async () => {
      fireEvent.canPlay(container.querySelector("video")!);
    });

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Play background video" })).not.toBeInTheDocument();
  });

  it("offers a user-initiated retry when autoplay is blocked", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("Autoplay blocked", "NotAllowedError"));
    const { container } = renderHero();

    await act(async () => {
      fireEvent.canPlay(container.querySelector("video")!);
    });

    const retryButton = screen.getByRole("button", { name: "Play background video" });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(play).toHaveBeenCalledTimes(2);
    expect(retryButton).toBeInTheDocument();
  });
});
