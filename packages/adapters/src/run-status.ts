import type { AdapterContext, AgentRuntime } from "@rakazo/adapter-kit";
import type { ReasoningStep } from "@rakazo/contracts";
import { containsSecret, redactSecrets, visibleReasoningSteps } from "@rakazo/core";
import { resolveSummaryModel, type SummaryModelSettings } from "./summary-model.js";

export const RUN_STATUS_MIN_ELAPSED_MS = 60_000;
export const RUN_STATUS_MIN_GAP_MS = 45_000;
export const RUN_STATUS_SAY_COOLDOWN_MS = 20_000;
const STATUS_TIMEOUT_MS = 12_000;

export function shouldEmitRunStatus(input: {
  now: number;
  startedAt: number;
  lastSayAt: number;
  lastStatusAt: number;
}): boolean {
  if (input.now - input.startedAt < RUN_STATUS_MIN_ELAPSED_MS) return false;
  if (input.lastStatusAt > 0 && input.now - input.lastStatusAt < RUN_STATUS_MIN_GAP_MS) {
    return false;
  }
  if (input.lastSayAt > 0 && input.now - input.lastSayAt < RUN_STATUS_SAY_COOLDOWN_MS) {
    return false;
  }
  return true;
}

export function statusTitlesFromSteps(steps: ReasoningStep[]): string[] {
  return visibleReasoningSteps(steps)
    .filter((step) => step.status === "running" || step.status === "done")
    .map((step) => step.title.trim())
    .filter(Boolean);
}

export async function handleSayTool(input: {
  args: Record<string, unknown>;
  secrets: string[];
  publish: (text: string) => Promise<void>;
}): Promise<{ ok: true } | { error: string }> {
  const text = redactSecrets(String(input.args.text ?? "").trim(), input.secrets);
  if (!text) return { error: "text is required" };
  if (containsSecret(text, input.secrets)) return { error: "refusing to publish a secret" };
  await input.publish(text);
  return { ok: true };
}

export async function generateRunStatusLine(input: {
  runtime: AgentRuntime;
  model: { provider: string; id: string; apiKey?: string };
  titles: string[];
  context: AdapterContext;
  botId: string;
  threadId: string;
  runId: string;
}): Promise<string | null> {
  const prompt = [
    "Write one short status line of what I am doing.",
    "No chain of thought. No plan. Output only the status line.",
    `Current work: ${input.titles.join("; ")}`,
  ].join("\n");
  let text = "";
  try {
    const timeout = AbortSignal.timeout(STATUS_TIMEOUT_MS);
    const signal = input.context.signal
      ? AbortSignal.any([input.context.signal, timeout])
      : timeout;
    for await (const event of input.runtime.run(
      {
        botId: input.botId,
        threadId: input.threadId,
        runId: `status:${input.runId}:${Date.now()}`,
        prompt,
        instructions: "One short status line of what I am doing. No chain of thought.",
        history: [],
        tools: [],
        model: input.model,
      },
      {
        ...input.context,
        operationId: `status:${input.runId}`,
        signal,
      },
    )) {
      if (event.type === "text") text += event.text;
      if (event.type === "done" && event.text) text = event.text;
    }
  } catch {
    return null;
  }
  const line = text.trim().split(/\n/)[0]?.trim() ?? "";
  return line || null;
}

export async function publishRunStatusIfDue(input: {
  now: number;
  startedAt: number;
  lastSayAt: number;
  lastStatusAt: number;
  steps: ReasoningStep[];
  settings?: SummaryModelSettings | null;
  env?: NodeJS.ProcessEnv;
  deploymentModelKey?: string;
  runtime: AgentRuntime;
  context: AdapterContext;
  botId: string;
  threadId: string;
  runId: string;
  secrets: string[];
  publish: (text: string) => Promise<void>;
  restoreDraft?: () => Promise<void>;
}): Promise<"published" | "skipped"> {
  if (!shouldEmitRunStatus(input)) return "skipped";
  const model = resolveSummaryModel({
    settings: input.settings,
    env: input.env ?? process.env,
    deploymentModelKey: input.deploymentModelKey,
    allowWorkspaceDefault: false,
  });
  if (!model) return "skipped";
  const titles = statusTitlesFromSteps(input.steps);
  if (!titles.length) return "skipped";
  const line = await generateRunStatusLine({
    runtime: input.runtime,
    model,
    titles,
    context: input.context,
    botId: input.botId,
    threadId: input.threadId,
    runId: input.runId,
  });
  if (!line) return "skipped";
  const safe = redactSecrets(line, input.secrets);
  if (!safe || containsSecret(safe, input.secrets)) return "skipped";
  await input.publish(safe);
  await input.restoreDraft?.().catch(() => undefined);
  return "published";
}
