import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_ACCOUNT_ID } from "./openclaw-compat.ts";
import {
  readGeweAllowFromStore,
  redeemGewePairCode,
  resolveGeweAllowFromPath,
  resolveGeweLegacyAllowFromPath,
  resolveGeweLegacyPairingPath,
  resolveGewePairCodesPath,
} from "./pairing-store.ts";

async function withTempStateDir<T>(
  fn: (env: NodeJS.ProcessEnv, stateDir: string) => Promise<T>,
): Promise<T> {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "gewe-pair-store-test-"));
  const env = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
  };
  try {
    return await fn(env, stateDir);
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("默认 account 会合并 scoped 与 legacy allowFrom store", async () => {
  await withTempStateDir(async (env) => {
    await writeJson(resolveGeweAllowFromPath(DEFAULT_ACCOUNT_ID, env), {
      version: 1,
      allowFrom: ["wx:wxid_scoped", "wxid_shared"],
    });
    await writeJson(resolveGeweLegacyAllowFromPath(env), {
      version: 1,
      allowFrom: ["gewe:wxid_shared", "wechat:wxid_legacy"],
    });

    const allowFrom = await readGeweAllowFromStore({
      accountId: DEFAULT_ACCOUNT_ID,
      env,
    });

    assert.deepEqual(allowFrom, ["wxid_scoped", "wxid_shared", "wxid_legacy"]);
  });
});

test("非默认 account 只读取自己的 scoped allowFrom store", async () => {
  await withTempStateDir(async (env) => {
    await writeJson(resolveGeweAllowFromPath("acct-alpha", env), {
      version: 1,
      allowFrom: ["wxid_alpha"],
    });
    await writeJson(resolveGeweLegacyAllowFromPath(env), {
      version: 1,
      allowFrom: ["wxid_legacy"],
    });

    const allowFrom = await readGeweAllowFromStore({
      accountId: "acct-alpha",
      env,
    });

    assert.deepEqual(allowFrom, ["wxid_alpha"]);
  });
});

test("GeWe 配对码会从本地 pair-codes store 兑换并写入 allowFrom", async () => {
  await withTempStateDir(async (env) => {
    await writeJson(resolveGewePairCodesPath(env), {
      version: 1,
      codes: [
        {
          code: "zxcv5678",
          accountId: "acct-pairing",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const redeemed = await redeemGewePairCode({
      accountId: "acct-pairing",
      code: "ZXCV5678",
      id: "wxid_scope_user",
      env,
    });

    assert.deepEqual(redeemed, {
      id: "wxid_scope_user",
      code: "ZXCV5678",
      source: "pair-codes",
    });
    assert.deepEqual(
      await readGeweAllowFromStore({ accountId: "acct-pairing", env }),
      ["wxid_scope_user"],
    );

    const raw = JSON.parse(
      await fs.readFile(resolveGewePairCodesPath(env), "utf8"),
    ) as { codes?: unknown[] };
    assert.deepEqual(raw.codes, []);
  });
});

test("GeWe 配对码会兼容宿主 legacy pairing store 并把发码者写入 allowFrom", async () => {
  await withTempStateDir(async (env) => {
    const now = new Date().toISOString();
    await writeJson(resolveGeweLegacyPairingPath(env), {
      version: 1,
      requests: [
        {
          id: "gh_c3819e351514",
          code: "ZXCV5678",
          createdAt: now,
          lastSeenAt: now,
          meta: {
            accountId: "acct-pairing",
          },
        },
      ],
    });

    const redeemed = await redeemGewePairCode({
      accountId: "acct-pairing",
      code: "ZXCV5678",
      id: "wxid_scope_user",
      env,
    });

    assert.deepEqual(redeemed, {
      id: "wxid_scope_user",
      code: "ZXCV5678",
      source: "legacy-pairing",
    });
    assert.deepEqual(
      await readGeweAllowFromStore({ accountId: "acct-pairing", env }),
      ["wxid_scope_user"],
    );

    const raw = JSON.parse(
      await fs.readFile(resolveGeweLegacyPairingPath(env), "utf8"),
    ) as { requests?: unknown[] };
    assert.deepEqual(raw.requests, []);
  });
});
