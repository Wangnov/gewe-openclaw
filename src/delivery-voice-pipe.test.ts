import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { setGeweRuntime } from "./runtime.ts";
import type { ResolvedGeweAccount } from "./types.ts";

const execFileAsync = promisify(execFile);

type DeliveryModule = {
  convertAudioToSilk?: (params: {
    account: ResolvedGeweAccount;
    sourcePath: string;
  }) => Promise<{ buffer: Buffer; durationMs: number } | null>;
};

function createAccount(config: ResolvedGeweAccount["config"]): ResolvedGeweAccount {
  return {
    accountId: "acct-test",
    enabled: true,
    token: "token",
    tokenSource: "config",
    appId: "app-id",
    appIdSource: "config",
    config,
  };
}

async function createNodeTool(params: {
  dir: string;
  name: string;
  body: string;
}): Promise<string> {
  const jsPath = path.join(params.dir, `${params.name}.js`);
  await fs.writeFile(jsPath, params.body, "utf8");

  if (process.platform === "win32") {
    const cmdPath = path.join(params.dir, `${params.name}.cmd`);
    await fs.writeFile(cmdPath, `@echo off\r\nnode "%~dp0\\${params.name}.js" %*\r\n`, "utf8");
    return cmdPath;
  }

  const launcherPath = path.join(params.dir, params.name);
  await fs.writeFile(
    launcherPath,
    `#!/bin/sh\nexec node "$(dirname "$0")/${params.name}.js" "$@"\n`,
    "utf8",
  );
  await fs.chmod(launcherPath, 0o755);
  return launcherPath;
}

async function createFakeTools(params: {
  dir: string;
  logPath: string;
  ffmpegPipeOnly?: boolean;
  silkPipeOnly?: boolean;
  silkFailPipe?: boolean;
}): Promise<{ ffmpegPath: string; silkPath: string }> {
  const ffmpegPath = await createNodeTool({
    dir: params.dir,
    name: "fake-ffmpeg",
    body: `
      import fs from "node:fs";

      const args = process.argv.slice(2);
      const inputPath = args[args.indexOf("-i") + 1];
      const outputPath = args.at(-1);
      const pipeOnly = ${JSON.stringify(params.ffmpegPipeOnly === true)};
      const logPath = ${JSON.stringify(params.logPath)};

      if (pipeOnly && outputPath !== "pipe:1" && outputPath !== "-") {
        fs.appendFileSync(logPath, "ffmpeg:file\\n");
        console.error("expected ffmpeg stdout output");
        process.exit(12);
      }

      const payload = fs.readFileSync(inputPath);
      if (outputPath === "pipe:1" || outputPath === "-") {
        fs.appendFileSync(logPath, "ffmpeg:pipe\\n");
        process.stdout.write(payload);
      } else {
        fs.appendFileSync(logPath, "ffmpeg:file\\n");
        fs.writeFileSync(outputPath, payload);
      }
    `,
  });

  const silkPath = await createNodeTool({
    dir: params.dir,
    name: "fake-silk",
    body: `
      import fs from "node:fs";

      const args = process.argv.slice(2);
      const inputPath = args[args.indexOf("-i") + 1];
      const outputPath = args[args.indexOf("-o") + 1];
      const pipeOnly = ${JSON.stringify(params.silkPipeOnly === true)};
      const failPipe = ${JSON.stringify(params.silkFailPipe === true)};
      const logPath = ${JSON.stringify(params.logPath)};

      if (pipeOnly && !(inputPath === "-" && outputPath === "-")) {
        fs.appendFileSync(logPath, "silk:file\\n");
        console.error("expected silk stdin/stdout");
        process.exit(13);
      }

      if (failPipe && inputPath === "-" && outputPath === "-") {
        fs.appendFileSync(logPath, "silk:pipe-fail\\n");
        console.error("pipe mode rejected");
        process.exit(14);
      }

      const payload = inputPath === "-" ? fs.readFileSync(0) : fs.readFileSync(inputPath);
      const encoded = Buffer.concat([Buffer.from("SILK:"), payload]);

      if (outputPath === "-") {
        fs.appendFileSync(logPath, "silk:pipe\\n");
        process.stdout.write(encoded);
      } else {
        fs.appendFileSync(logPath, "silk:file\\n");
        fs.writeFileSync(outputPath, encoded);
      }
    `,
  });

  return { ffmpegPath, silkPath };
}

function installRuntime() {
  setGeweRuntime({
    logging: {
      getChildLogger: () => ({
        info() {},
        warn() {},
        error() {},
      }),
    },
    system: {
      async runCommandWithTimeout(argv: string[], options: { timeoutMs: number }) {
        try {
          const { stdout, stderr } = await execFileAsync(argv[0] ?? "", argv.slice(1), {
            timeout: options.timeoutMs,
            encoding: "utf8",
          });
          return {
            pid: undefined,
            stdout,
            stderr,
            code: 0,
            signal: null,
            killed: false,
            termination: "exit" as const,
          };
        } catch (err) {
          const error = err as Error & {
            code?: number | string;
            signal?: NodeJS.Signals | null;
            killed?: boolean;
            stdout?: string;
            stderr?: string;
          };
          return {
            pid: undefined,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? error.message,
            code: typeof error.code === "number" ? error.code : 1,
            signal: error.signal ?? null,
            killed: error.killed ?? false,
            termination: error.killed ? ("timeout" as const) : ("exit" as const),
          };
        }
      },
    },
  } as never);
}

test("voiceSilkPipe 开启时会优先走 stdin/stdout 编码", async () => {
  installRuntime();
  const deliveryModule = (await import("./delivery.ts")) as DeliveryModule;
  assert.equal(typeof deliveryModule.convertAudioToSilk, "function");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-voice-pipe-test-"));
  try {
    const logPath = path.join(tmpDir, "tool.log");
    const sourcePath = path.join(tmpDir, "source.pcm");
    await fs.writeFile(sourcePath, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const { ffmpegPath, silkPath } = await createFakeTools({
      dir: tmpDir,
      logPath,
      ffmpegPipeOnly: true,
      silkPipeOnly: true,
    });

    const converted = await deliveryModule.convertAudioToSilk?.({
      account: createAccount({
        voiceFfmpegPath: ffmpegPath,
        voiceSilkPath: silkPath,
        voiceSilkArgs: [
          "encode",
          "-i",
          "{input}",
          "-o",
          "{output}",
          "--sample-rate",
          "{sampleRate}",
          "--quiet",
        ],
        voiceSilkPipe: true,
        voiceSampleRate: 100,
      }),
      sourcePath,
    });

    assert.ok(converted);
    assert.deepEqual(converted.buffer, Buffer.from("SILK:\x00\x01\x02\x03\x04\x05\x06\x07"));
    assert.equal(converted.durationMs, 40);

    const log = await fs.readFile(logPath, "utf8");
    assert.match(log, /ffmpeg:pipe/);
    assert.match(log, /silk:pipe/);
    assert.doesNotMatch(log, /ffmpeg:file/);
    assert.doesNotMatch(log, /silk:file/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("voiceSilkPipe 失败时会回退到临时文件模式", async () => {
  installRuntime();
  const deliveryModule = (await import("./delivery.ts")) as DeliveryModule;
  assert.equal(typeof deliveryModule.convertAudioToSilk, "function");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-voice-pipe-fallback-test-"));
  try {
    const logPath = path.join(tmpDir, "tool.log");
    const sourcePath = path.join(tmpDir, "source.pcm");
    await fs.writeFile(sourcePath, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const { ffmpegPath, silkPath } = await createFakeTools({
      dir: tmpDir,
      logPath,
      silkFailPipe: true,
    });

    const converted = await deliveryModule.convertAudioToSilk?.({
      account: createAccount({
        voiceFfmpegPath: ffmpegPath,
        voiceSilkPath: silkPath,
        voiceSilkArgs: [
          "encode",
          "-i",
          "{input}",
          "-o",
          "{output}",
          "--sample-rate",
          "{sampleRate}",
          "--quiet",
        ],
        voiceSilkPipe: true,
        voiceSampleRate: 100,
      }),
      sourcePath,
    });

    assert.ok(converted);
    assert.deepEqual(converted.buffer, Buffer.from("SILK:\x00\x01\x02\x03\x04\x05\x06\x07"));
    assert.equal(converted.durationMs, 40);

    const log = await fs.readFile(logPath, "utf8");
    assert.match(log, /ffmpeg:pipe/);
    assert.match(log, /silk:pipe-fail/);
    assert.match(log, /ffmpeg:file/);
    assert.match(log, /silk:file/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
