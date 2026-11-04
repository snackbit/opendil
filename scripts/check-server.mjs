/**
 * Process lifecycle for the Next.js site checks (check-site and
 * check-rebuild). Each child runs in its own process group so stopping it
 * also stops its workers. A terminal Ctrl+C does not reach those groups, so
 * cleanupOnExit runs the check's cleanup when the check is interrupted.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let interrupted = false;
/** True once a signal started cleanup; checks then skip their failure report. */
export const wasInterrupted = () => interrupted;

/** Fails when the port is taken, so a check never tests a server it did not start. */
export async function assertPortFree(port, variable) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) =>
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is in use, possibly by a server an interrupted check left running. Stop it or set ${variable}.`,
            )
          : error,
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

/** Starts `node <args>` as the leader of a new process group. */
export function startProcessGroup(args, { cwd, env }) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: "pipe",
    detached: true,
  });
  let log = "";
  const captures = new Set();
  const keep = (data) => {
    const text = String(data);
    log = (log + text).slice(-20000);
    for (const capture of captures) capture.push(text);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  const exited = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
    child.on("error", (error) => {
      keep(error.message);
      resolve({ code: null, signal: null });
    });
  });
  const signalGroup = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      /* The group has already exited. */
    }
  };
  return {
    /** The last 20000 characters of output, for diagnostics. */
    log: () => log,
    exited,
    /** Collects all output from now on; the returned function reads it. */
    capture() {
      const parts = [];
      captures.add(parts);
      return () => parts.join("");
    },
    async stop() {
      if (child.pid === undefined) return;
      signalGroup("SIGTERM");
      await Promise.race([exited, sleep(5000)]);
      // Workers can outlive the leader; SIGKILL whatever is left of the group.
      signalGroup("SIGKILL");
    },
  };
}

/** Runs a process group to completion and rejects with its output when it fails. */
export async function runProcessGroup(group, label) {
  const { code, signal } = await group.exited;
  if (code !== 0)
    throw new Error(
      `${label} exited with ${signal ?? code}:\n${group.log().slice(-6000)}`,
    );
}

/** Waits until url answers 2xx; fails early when the server exits first. */
export async function waitForServer(url, server, seconds) {
  let exit;
  server.exited.then((result) => (exit = result));
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (exit)
      throw new Error(
        `Server exited with ${exit.signal ?? exit.code} before ${url} answered:\n${server.log()}`,
      );
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).ok) return;
    } catch {
      /* The owned server is starting. */
    }
    await sleep(200);
  }
  throw new Error(
    `Server at ${url} did not answer within ${seconds}s:\n${server.log()}`,
  );
}

/**
 * Returns a function that runs cleanup once. Call it from the check's finally
 * block; SIGINT, SIGTERM and SIGHUP also run it and then exit with 128 + signal.
 * A second signal terminates immediately. Launch Playwright browsers with
 * handleSIGINT, handleSIGTERM and handleSIGHUP false, or Playwright exits first.
 */
export function cleanupOnExit(cleanup) {
  let running;
  const run = () =>
    (running ??= Promise.resolve()
      .then(cleanup)
      .catch((error) => console.error("Cleanup failed:", error)));
  const codes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  for (const [signal, code] of Object.entries(codes))
    process.once(signal, () => {
      interrupted = true;
      console.error(`Interrupted by ${signal}; cleaning up.`);
      run().finally(() => process.exit(code));
    });
  return run;
}

/** Prints each distinct failure once, with how often it occurred. */
export function printGrouped(messages) {
  const counts = new Map();
  for (const message of messages)
    counts.set(message, (counts.get(message) ?? 0) + 1);
  for (const [message, count] of counts)
    console.error(`  - ${message}${count > 1 ? ` (${count}x)` : ""}`);
}
