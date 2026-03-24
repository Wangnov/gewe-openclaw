import type { PluginRuntime } from "./openclaw-compat.js";

let runtime: PluginRuntime | null = null;

export function setGeweRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getGeweRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("GeWe runtime not initialized");
  }
  return runtime;
}
