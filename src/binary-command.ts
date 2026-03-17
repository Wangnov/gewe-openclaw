import { spawn } from "node:child_process";

export type BinaryCommandResult = {
  stdout: Buffer;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
};

export async function runBinaryCommand(params: {
  argv: string[];
  timeoutMs: number;
  input?: Buffer;
}): Promise<BinaryCommandResult> {
  const [command, ...args] = params.argv;
  if (!command) {
    throw new Error("missing command");
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, params.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        code,
        signal,
        timedOut,
      });
    });

    if (params.input && params.input.length) {
      child.stdin?.end(params.input);
    } else {
      child.stdin?.end();
    }
  });
}
