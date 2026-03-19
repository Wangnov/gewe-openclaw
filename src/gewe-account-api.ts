import { postGeweAccountJson } from "./api.js";
import type { ResolvedGeweAccount } from "./types.js";

export type GeweApiMethodParams<T extends Record<string, unknown>> = T & {
  account: ResolvedGeweAccount;
};

export type GeweApiMethod<T extends Record<string, unknown>, R = unknown> = (
  params: GeweApiMethodParams<T>,
) => Promise<R | undefined>;

export function createGeweAccountMethod<T extends Record<string, unknown>, R = unknown>(
  path: string,
): GeweApiMethod<T, R> {
  return async (params) => {
    const { account, ...body } = params;
    return await postGeweAccountJson<R>({
      account,
      path,
      context: path.split("/").pop() ?? path,
      body,
    });
  };
}

export type GeweApiObject = Record<string, unknown>;
export type GeweApiList = GeweApiObject[];
