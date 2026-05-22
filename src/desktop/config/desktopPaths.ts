import path from "node:path";

import { app } from "electron";

export function resolveDesktopStaticDir(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "dist-web");
  }

  return path.resolve(process.cwd(), "dist-web");
}
