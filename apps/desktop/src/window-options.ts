export const DEFAULT_WARM_WINDOW_TTL_MS = 15 * 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const TITLEBAR_OVERLAY_HEIGHT = 36;

export function warmWindowTtlMs(value: string | undefined) {
  if (value === undefined || value.trim() === "") return DEFAULT_WARM_WINDOW_TTL_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_TIMER_DELAY_MS
    ? parsed
    : DEFAULT_WARM_WINDOW_TTL_MS;
}

function windowChrome(platform: NodeJS.Platform) {
  const mac = platform === "darwin";
  const windows = platform === "win32";
  return {
    backgroundColor: "#111111",
    show: true,
    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: mac ? ("hiddenInset" as const) : windows ? ("hidden" as const) : undefined,
    trafficLightPosition: mac ? { x: 16, y: 16 } : undefined,
    titleBarOverlay: windows
      ? {
          color: "#111111",
          symbolColor: "#ECECEE",
          height: TITLEBAR_OVERLAY_HEIGHT,
        }
      : undefined,
  };
}

export function browserWindowOptions(platform: NodeJS.Platform) {
  return { width: 1440, height: 900, ...windowChrome(platform) };
}

/** The first-run setup window is smaller and uses the same native chrome. */
export function setupWindowOptions(platform: NodeJS.Platform) {
  return { width: 720, height: 700, minWidth: 480, minHeight: 560, ...windowChrome(platform) };
}
