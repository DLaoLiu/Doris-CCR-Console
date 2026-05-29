import { spawn } from "node:child_process";

const npm = "npm";

function runScript(script) {
  return spawn(npm, ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true
  });
}

const processes = [
  runScript("dev:server"),
  runScript("dev:web")
];

const stopAll = (code = 0) => {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
};

for (const child of processes) {
  child.on("error", (error) => {
    console.error(error);
    stopAll(1);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) stopAll(code);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
