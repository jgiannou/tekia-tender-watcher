import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app, type BrowserWindow, screen } from "electron";

export type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

const DEFAULT_STATE: WindowState = {
  width: 1400,
  height: 900,
};

const statePath = (): string => join(app.getPath("userData"), "window-state.json");

export const loadWindowState = (): WindowState => {
  try {
    const path = statePath();
    if (!existsSync(path)) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(readFileSync(path, "utf8")) as WindowState;
    return {
      width: Math.max(1100, parsed.width || DEFAULT_STATE.width),
      height: Math.max(700, parsed.height || DEFAULT_STATE.height),
      x: parsed.x,
      y: parsed.y,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
};

export const trackWindowState = (win: BrowserWindow): void => {
  const save = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const bounds = win.getBounds();
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(
      statePath(),
      JSON.stringify(
        {
          x: bounds.x,
          y: bounds.y,
          width: Math.max(1100, bounds.width),
          height: Math.max(700, bounds.height),
        } satisfies WindowState,
        null,
        2,
      ),
      "utf8",
    );
  };

  win.on("resize", save);
  win.on("move", save);
  win.on("close", save);
};

export const isOnScreen = (state: WindowState): boolean => {
  if (state.x == null || state.y == null) return false;
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    return (
      state.x! >= x - 50 &&
      state.y! >= y - 50 &&
      state.x! < x + width &&
      state.y! < y + height
    );
  });
};
