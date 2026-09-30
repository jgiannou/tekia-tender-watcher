import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "..");
const dashboardRoot = join(desktopRoot, "..", "dashboard");

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ELECTRON: "1" },
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed: ${code}`)),
    );
  });

await run(
  "pnpm",
  ["exec", "vite", "build", "--outDir", "../desktop/renderer-dist", "--emptyOutDir"],
  dashboardRoot,
);

console.log("[desktop] renderer built → apps/desktop/renderer-dist");
