import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";

const { BrowserWindow, shell } = electron;

export function createMainWindow(url: string): BrowserWindowType {
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#f6f6f3",
    height: 860,
    minHeight: 680,
    minWidth: 980,
    show: false,
    title: "Codex Mate",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: 1280
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    void shell.openExternal(nextUrl);
    return { action: "deny" };
  });

  void window.loadURL(url);
  return window;
}
