import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";

import {
  DESKTOP_WINDOW_CONFIG,
  getDesktopWindowChromeOptions,
  getInitialWindowBounds,
  type DesktopWindowBounds
} from "../domain/windowState.js";
import { installNavigationGuard } from "./navigationGuard.js";

const { BrowserWindow } = electron;

export interface CreateMainWindowOptions {
  initialBounds?: DesktopWindowBounds | null;
}

export function createMainWindow(url: string, options: CreateMainWindowOptions = {}): BrowserWindowType {
  const bounds = getInitialWindowBounds(options.initialBounds);
  const window = new BrowserWindow({
    autoHideMenuBar: process.platform !== "darwin",
    backgroundColor: DESKTOP_WINDOW_CONFIG.backgroundColor,
    height: bounds.height,
    minHeight: DESKTOP_WINDOW_CONFIG.minHeight,
    minWidth: DESKTOP_WINDOW_CONFIG.minWidth,
    show: false,
    title: "CoMate",
    ...getDesktopWindowChromeOptions(process.platform),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: "comate-memory",
      sandbox: true
    },
    width: bounds.width,
    x: bounds.x,
    y: bounds.y
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  installNavigationGuard(window, url);

  void window.loadURL(url);
  return window;
}
