import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type RakazoDesktop, windowChromeKind } from "./desktop.js";

function desktop(platform: string): RakazoDesktop {
  return {
    platform,
    window: {
      close: async () => undefined,
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      state: async () => ({ minimized: false, maximized: false, fullScreen: false }),
    },
    update: {
      state: async () => updateState,
      check: async () => updateState,
      download: async () => updateState,
      install: async () => updateState,
    },
  };
}

const updateState = {
  phase: "idle" as const,
  currentVersion: "0.1.0",
  availableVersion: null,
  percent: null,
  message: null,
  checkedAt: null,
};

describe("window chrome", () => {
  it("does not paint fake traffic lights in the browser", () => {
    expect(windowChromeKind(undefined)).toBe("spacer");
  });

  it("leaves macOS traffic lights to Electron", () => {
    expect(windowChromeKind(desktop("darwin"))).toBe("darwin");
  });

  it("uses a native caption overlay on Windows", () => {
    expect(windowChromeKind(desktop("win32"))).toBe("overlay");
  });

  it("uses a native framed window on Linux", () => {
    expect(windowChromeKind(desktop("linux"))).toBe("framed");
  });

  it("does not paint fake traffic lights into the browser shell, welcome page, or window chrome", () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../pages");
    const shell = readFileSync(path.join(root, "Shell.tsx"), "utf8");
    const welcome = readFileSync(path.join(root, "Welcome.tsx"), "utf8");
    const chrome = readFileSync(path.join(root, "WindowChrome.tsx"), "utf8");
    expect(shell).not.toContain("FF5F57");
    expect(welcome).not.toContain("FF5F57");
    expect(chrome).not.toContain("FF5F57");
    expect(chrome).not.toContain("FEBC2E");
    expect(chrome).not.toContain("28C840");
    expect(shell).not.toContain('className="app-drag h-9 shrink-0"');
    expect(welcome).not.toContain('className="app-drag h-9 shrink-0"');
  });
});
