import type {
  ChannelPlugin,
  ChannelSetupInput,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk";

type SetupCredentialValues = Partial<Record<string, string>>;

export type GeweSetupWizardStatus = {
  configuredLabel: string;
  unconfiguredLabel: string;
  configuredHint?: string;
  unconfiguredHint?: string;
  configuredScore?: number;
  unconfiguredScore?: number;
  resolveConfigured: (params: { cfg: OpenClawConfig }) => boolean | Promise<boolean>;
  resolveStatusLines?: (params: {
    cfg: OpenClawConfig;
    configured: boolean;
  }) => string[] | Promise<string[]>;
};

export type GeweSetupWizardCredentialState = {
  accountConfigured: boolean;
  hasConfiguredValue: boolean;
  resolvedValue?: string;
  envValue?: string;
};

export type GeweSetupWizardNote = {
  title: string;
  lines: string[];
  shouldShow?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
  }) => boolean | Promise<boolean>;
};

export type GeweSetupWizardCredential = {
  inputKey: keyof ChannelSetupInput | string;
  providerHint: string;
  credentialLabel: string;
  preferredEnvVar?: string;
  envPrompt: string;
  keepPrompt: string;
  inputPrompt: string;
  allowEnv?: (params: { cfg: OpenClawConfig; accountId: string }) => boolean;
  inspect: (params: {
    cfg: OpenClawConfig;
    accountId: string;
  }) => GeweSetupWizardCredentialState;
  applyUseEnv?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
  }) => OpenClawConfig | Promise<OpenClawConfig>;
  applySet?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
    value: unknown;
    resolvedValue: string;
  }) => OpenClawConfig | Promise<OpenClawConfig>;
};

export type GeweSetupWizardTextInput = {
  inputKey: keyof ChannelSetupInput | string;
  message: string;
  placeholder?: string;
  required?: boolean;
  applyEmptyValue?: boolean;
  currentValue?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
  }) => string | undefined | Promise<string | undefined>;
  initialValue?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
  }) => string | undefined | Promise<string | undefined>;
  validate?: (params: {
    value: string;
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
  }) => string | undefined;
  normalizeValue?: (params: {
    value: string;
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
  }) => string;
  applySet?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    value: string;
  }) => OpenClawConfig | Promise<OpenClawConfig>;
};

export type GeweSetupWizardAllowFromEntry = {
  input: string;
  resolved: boolean;
  id: string | null;
};

export type GeweSetupWizardAllowFrom = {
  message: string;
  placeholder: string;
  invalidWithoutCredentialNote: string;
  parseInputs?: (raw: string) => string[];
  parseId: (raw: string) => string | null;
  resolveEntries: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    credentialValues: SetupCredentialValues;
    entries: string[];
  }) => Promise<GeweSetupWizardAllowFromEntry[]>;
  apply: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    allowFrom: string[];
  }) => OpenClawConfig | Promise<OpenClawConfig>;
};

export type GeweSetupWizardFinalize = (params: {
  cfg: OpenClawConfig;
  accountId: string;
  credentialValues: SetupCredentialValues;
  runtime: unknown;
  prompter: WizardPrompter;
  options?: unknown;
  forceAllowFrom: boolean;
}) =>
  | {
      cfg?: OpenClawConfig;
      credentialValues?: SetupCredentialValues;
    }
  | void
  | Promise<
      | {
          cfg?: OpenClawConfig;
          credentialValues?: SetupCredentialValues;
        }
      | void
    >;

export type GeweSetupWizard = {
  channel: string;
  status: GeweSetupWizardStatus;
  introNote?: GeweSetupWizardNote;
  credentials: GeweSetupWizardCredential[];
  textInputs?: GeweSetupWizardTextInput[];
  allowFrom?: GeweSetupWizardAllowFrom;
  finalize?: GeweSetupWizardFinalize;
  completionNote?: GeweSetupWizardNote;
};

export type GeweChannelPlugin<ResolvedAccount = unknown> = ChannelPlugin<ResolvedAccount> & {
  setupWizard?: GeweSetupWizard;
};
