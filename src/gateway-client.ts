import {
  resolveGatewayCallbackUrl,
  resolveGatewayGroupBindings,
  resolveGeweTransportBaseUrl,
} from "./accounts.js";
import { postGatewayJson } from "./api.js";
import type { ResolvedGeweAccount } from "./types.js";

type GatewayControlResponse = {
  ok?: boolean;
  error?: string;
};

function requireGatewayField(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`GeWe gateway ${field} is required`);
  }
  return trimmed;
}

function buildGatewayRegistrationBody(params: {
  account: ResolvedGeweAccount;
  pluginVersion: string;
}) {
  const callbackUrl = resolveGatewayCallbackUrl(params.account);
  const groups = resolveGatewayGroupBindings(params.account);
  return {
    instanceId: requireGatewayField(params.account.config.gatewayInstanceId, "instanceId"),
    callbackUrl: requireGatewayField(callbackUrl, "callbackUrl"),
    callbackSecret: params.account.config.webhookSecret?.trim() ?? "",
    groups,
    pluginVersion: params.pluginVersion,
  };
}

async function postGatewayControl(params: {
  account: ResolvedGeweAccount;
  path: string;
  body: Record<string, unknown>;
}): Promise<GatewayControlResponse> {
  const baseUrl = resolveGeweTransportBaseUrl(params.account);
  const gatewayKey = requireGatewayField(params.account.config.gatewayKey, "key");
  return postGatewayJson<GatewayControlResponse>({
    baseUrl,
    gatewayKey,
    path: params.path,
    body: params.body,
  });
}

function assertGatewayOk(
  response: GatewayControlResponse,
  action: "register" | "heartbeat" | "unregister",
): GatewayControlResponse {
  if (response.ok === false) {
    throw new Error(response.error?.trim() || `GeWe gateway ${action} failed`);
  }
  return response;
}

export async function registerGatewayInstance(params: {
  account: ResolvedGeweAccount;
  pluginVersion: string;
}): Promise<GatewayControlResponse> {
  return assertGatewayOk(
    await postGatewayControl({
      account: params.account,
      path: "/gateway/v1/instances/register",
      body: buildGatewayRegistrationBody(params),
    }),
    "register",
  );
}

export async function heartbeatGatewayInstance(params: {
  account: ResolvedGeweAccount;
}): Promise<GatewayControlResponse> {
  return assertGatewayOk(
    await postGatewayControl({
      account: params.account,
      path: "/gateway/v1/instances/heartbeat",
      body: {
        instanceId: requireGatewayField(params.account.config.gatewayInstanceId, "instanceId"),
      },
    }),
    "heartbeat",
  );
}

export async function unregisterGatewayInstance(params: {
  account: ResolvedGeweAccount;
}): Promise<GatewayControlResponse> {
  return assertGatewayOk(
    await postGatewayControl({
      account: params.account,
      path: "/gateway/v1/instances/unregister",
      body: {
        instanceId: requireGatewayField(params.account.config.gatewayInstanceId, "instanceId"),
      },
    }),
    "unregister",
  );
}
