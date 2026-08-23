import { desktopBridge, windowChromeKind } from "../lib/desktop";

export function WindowChrome() {
  const desktop = desktopBridge();
  const kind = windowChromeKind(desktop);
  if (kind === "darwin") {
    return <div className="app-drag h-3 w-[72px]" aria-hidden="true" />;
  }
  if (kind === "overlay") {
    return <div className="app-drag h-3 min-w-[8px] flex-1" aria-hidden="true" />;
  }
  if (kind === "framed") {
    return null;
  }
  return <div className="h-3 w-[72px]" aria-hidden="true" />;
}
