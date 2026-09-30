import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "..");
const repoRoot = join(desktopRoot, "..", "..");
const require = createRequire(import.meta.url);
const electronPath = require("electron");

const waitUntilOccupied = async (port, timeoutMs = 60_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const free = await new Promise((resolve) => {
      const socket = createServer()
        .once("error", () => resolve(false))
        .once("listening", () => {
          socket.close(() => resolve(true));
        })
        .listen(port, "127.0.0.1");
    });
    if (!free) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for Vite on port ${port}`);
};

const run = async () => {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["compile"], {
      cwd: desktopRoot,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`compile failed: ${code}`)),
    );
  });

  const vite = spawn("pnpm", ["--filter", "@tekia/dashboard", "dev"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ELECTRON: "1" },
  });

  await waitUntilOccupied(5173);

  const electron = spawn(electronPath, ["."], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: "http://127.0.0.1:5173",
    },
  });

  const shutdown = () => {
    electron.kill();
    vite.kill();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  electron.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
};

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
