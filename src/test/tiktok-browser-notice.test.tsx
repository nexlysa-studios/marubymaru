import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TikTokBrowserNotice from "@/components/TikTokBrowserNotice";
import { isTikTokInAppBrowser } from "@/lib/tiktokBrowser";

afterEach(cleanup);

describe("TikTok in-app browser notice", () => {
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) TikTok/34.0",
    "Mozilla/5.0 BytedanceWebview musical_ly",
    "Mozilla/5.0 (Linux; Android 14) com.zhiliaoapp.musically",
  ])("detects TikTok user agents: %s", (userAgent) => {
    expect(isTikTokInAppBrowser(userAgent)).toBe(true);
  });

  it("does not detect other in-app browsers", () => {
    expect(isTikTokInAppBrowser("Mozilla/5.0 Instagram 320.0")).toBe(false);
    expect(isTikTokInAppBrowser("Mozilla/5.0 Chrome/130.0 Mobile Safari/537.36")).toBe(false);
  });

  it("shows a dismissible tip only in TikTok's browser", () => {
    const originalUserAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: "TikTok/34.0" });

    const { unmount } = render(<TikTokBrowserNotice />);
    expect(screen.getByRole("complementary", { name: "TikTok browser tip" })).toHaveTextContent("Open in browser");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss browser tip" }));
    expect(screen.queryByRole("complementary", { name: "TikTok browser tip" })).not.toBeInTheDocument();

    unmount();
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: originalUserAgent });
  });
});
