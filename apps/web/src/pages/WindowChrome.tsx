import { desktopBridge, windowChromeKind } from "../lib/desktop";

export function WindowChrome() {
  const desktop = desktopBridge();
  const kind = windowChromeKind(desktop);
  if (kind === "darwin") {
    return <div className="app-drag h-9 w-[72px] shrink-0" aria-hidden="true" />;
  }
  return null;
}
