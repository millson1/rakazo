export const DEFAULT_SUMMARY_MODEL_ID = "deepseek/deepseek-v4-flash-0731";
export const DEFAULT_SUMMARY_PROVIDER = "openrouter";

export type SummaryModelRef = {
  provider: string;
  id: string;
  apiKey?: string;
};

export type SummaryModelSettings = {
  summaryModelProvider?: string | null;
  summaryModelId?: string | null;
  defaultModelProvider?: string | null;
  defaultModelId?: string | null;
};

function isLocalProvider(provider: string): boolean {
  return provider === "mlx" || provider === "local-mlx" || provider === "ollama" || provider === "local";
}

function pick(provider?: string | null, id?: string | null): { provider: string; id: string } | null {
  const p = provider?.trim();
  const i = id?.trim();
  if (!p || !i || p === "scripted" || i === "scripted") return null;
  return { provider: p, id: i };
}

function withKey(
  ref: { provider: string; id: string },
  deploymentModelKey?: string,
): SummaryModelRef {
  if (!deploymentModelKey || isLocalProvider(ref.provider)) return ref;
  return { ...ref, apiKey: deploymentModelKey };
}

export function resolveSummaryModel(input: {
  settings?: SummaryModelSettings | null;
  env?: { PI_SUMMARY_MODEL?: string; PI_SUMMARY_PROVIDER?: string };
  deploymentModelKey?: string;
  allowWorkspaceDefault?: boolean;
}): SummaryModelRef | null {
  const env = input.env ?? {};
  const fromSettings = pick(input.settings?.summaryModelProvider, input.settings?.summaryModelId);
  if (fromSettings) return withKey(fromSettings, input.deploymentModelKey);

  const envModel = env.PI_SUMMARY_MODEL?.trim();
  if (envModel) {
    const fromEnv = pick(env.PI_SUMMARY_PROVIDER ?? DEFAULT_SUMMARY_PROVIDER, envModel);
    if (fromEnv) return withKey(fromEnv, input.deploymentModelKey);
  }

  if (input.deploymentModelKey) {
    return {
      provider: DEFAULT_SUMMARY_PROVIDER,
      id: DEFAULT_SUMMARY_MODEL_ID,
      apiKey: input.deploymentModelKey,
    };
  }

  if (input.allowWorkspaceDefault) {
    const workspace = pick(input.settings?.defaultModelProvider, input.settings?.defaultModelId);
    if (workspace) return withKey(workspace, input.deploymentModelKey);
  }

  return null;
}
