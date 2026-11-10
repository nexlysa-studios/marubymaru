export function isTikTokInAppBrowser(userAgent: string): boolean {
  return /tiktok|bytedancewebview|musical_ly|com\.zhiliaoapp\.musically/i.test(userAgent);
}
