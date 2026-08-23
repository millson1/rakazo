import type { RakazoDesktop } from "@rakazo/contracts";

export type { RakazoDesktop } from "@rakazo/contracts";

declare global {
  interface Window {
    rakazoDesktop?: RakazoDesktop;
  }
}

export function desktopBridge(): RakazoDesktop | undefined {
  return typeof window === "undefined" ? undefined : window.rakazoDesktop;
}

export function windowChromeKind(
  desktop?: RakazoDesktop,
): "spacer" | "darwin" | "overlay" | "framed" {
  if (!desktop) return "spacer";
  if (desktop.platform === "darwin") return "darwin";
  if (desktop.platform === "win32") return "overlay";
  return "framed";
}
