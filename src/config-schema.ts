import {
  BlockStreamingCoalesceSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ToolPolicySchema,
  requireOpenAllowFrom,
} from "openclaw/plugin-sdk";
import { z } from "zod";

export const GeweGroupSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    skills: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
  })
  .strict();

export const GeweAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    apiBaseUrl: z.string().optional(),
    token: z.string().optional(),
    tokenFile: z.string().optional(),
    appId: z.string().optional(),
    appIdFile: z.string().optional(),
    webhookPort: z.number().int().positive().optional(),
    webhookHost: z.string().optional(),
    webhookPath: z.string().optional(),
    webhookSecret: z.string().optional(),
    webhookPublicUrl: z.string().optional(),
    mediaPort: z.number().int().positive().optional(),
    mediaHost: z.string().optional(),
    mediaPath: z.string().optional(),
    mediaPublicUrl: z.string().optional(),
    mediaMaxMb: z.number().positive().optional(),
    voiceAutoConvert: z.boolean().optional(),
    voiceFfmpegPath: z.string().optional(),
    voiceSilkPath: z.string().optional(),
    voiceSilkArgs: z.array(z.string()).optional(),
    voiceSilkPipe: z.boolean().optional(),
    voiceSampleRate: z.number().int().positive().optional(),
    voiceDecodePath: z.string().optional(),
    voiceDecodeArgs: z.array(z.string()).optional(),
    voiceDecodeSampleRate: z.number().int().positive().optional(),
    voiceDecodeOutput: z.enum(["pcm", "wav"]).optional(),
    silkAutoDownload: z.boolean().optional(),
    silkVersion: z.string().optional(),
    silkBaseUrl: z.string().optional(),
    silkSha256: z.string().optional(),
    silkAllowUnverified: z.boolean().optional(),
    silkInstallDir: z.string().optional(),
    videoFfmpegPath: z.string().optional(),
    videoFfprobePath: z.string().optional(),
    videoThumbUrl: z.string().optional(),
    downloadMinDelayMs: z.number().int().min(0).optional(),
    downloadMaxDelayMs: z.number().int().min(0).optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.string()).optional(),
    groupAllowFrom: z.array(z.string()).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groups: z.record(z.string(), GeweGroupSchema.optional()).optional(),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const min = value.downloadMinDelayMs;
    const max = value.downloadMaxDelayMs;
    if (typeof min === "number" && typeof max === "number" && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["downloadMaxDelayMs"],
        message: "downloadMaxDelayMs must be >= downloadMinDelayMs",
      });
    }
  });

export const GeweAccountSchema = GeweAccountSchemaBase.superRefine((value, ctx) => {
  const pathHint = "channels.gewe-openclaw";
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      `${pathHint}.dmPolicy="open" requires ${pathHint}.allowFrom to include "*"`,
  });
});

export const GeweConfigSchema = GeweAccountSchemaBase.extend({
  accounts: z.record(z.string(), GeweAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  const pathHint = "channels.gewe-openclaw";
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      `${pathHint}.dmPolicy="open" requires ${pathHint}.allowFrom to include "*"`,
  });
});
