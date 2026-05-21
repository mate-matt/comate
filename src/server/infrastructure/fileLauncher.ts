import { spawn } from "node:child_process";

export type FileLaunchAction = "openFile" | "revealFile";

export class FileLauncher {
  open(filePath: string, action: FileLaunchAction): void {
    const args = action === "revealFile" ? ["-R", filePath] : [filePath];
    const child = spawn("open", args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  }
}
