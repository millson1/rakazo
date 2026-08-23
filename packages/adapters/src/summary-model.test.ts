import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUMMARY_MODEL_ID,
  DEFAULT_SUMMARY_PROVIDER,
  resolveSummaryModel,
} from "./summary-model.js";

describe("resolveSummaryModel", () => {
  it("prefers an explicit summary model over the workspace default and cheap fallback", () => {
    expect(
      resolveSummaryModel({
        settings: {
          summaryModelProvider: "openrouter",
          summaryModelId: "moonshotai/kimi-k2",
          defaultModelProvider: "openrouter",
          defaultModelId: "anthropic/claude-sonnet-4",
        },
        deploymentModelKey: "or-key",
        allowWorkspaceDefault: true,
      }),
    ).toEqual({
      provider: "openrouter",
      id: "moonshotai/kimi-k2",
      apiKey: "or-key",
    });
  });

  it("uses PI_SUMMARY_MODEL when settings are unset", () => {
    expect(
      resolveSummaryModel({
        settings: {
          defaultModelProvider: "openrouter",
          defaultModelId: "anthropic/claude-sonnet-4",
        },
        env: { PI_SUMMARY_MODEL: "google/gemini-2.5-flash", PI_SUMMARY_PROVIDER: "openrouter" },
        deploymentModelKey: "or-key",
      }),
    ).toEqual({
      provider: "openrouter",
      id: "google/gemini-2.5-flash",
      apiKey: "or-key",
    });
  });

  it("uses the cheap default only when a cloud key exists", () => {
    expect(
      resolveSummaryModel({
        deploymentModelKey: "or-key",
      }),
    ).toEqual({
      provider: DEFAULT_SUMMARY_PROVIDER,
      id: DEFAULT_SUMMARY_MODEL_ID,
      apiKey: "or-key",
    });
  });

  it("never falls back to scripted or a missing cheap model", () => {
    expect(
      resolveSummaryModel({
        settings: { summaryModelProvider: "scripted", summaryModelId: "scripted" },
      }),
    ).toBeNull();
    expect(resolveSummaryModel({})).toBeNull();
  });

  it("falls back to the workspace default only for local keyless setups", () => {
    expect(
      resolveSummaryModel({
        settings: {
          defaultModelProvider: "local-mlx",
          defaultModelId: "mlx-community/Qwen3.8-27B-4bit",
        },
        allowWorkspaceDefault: true,
      }),
    ).toEqual({
      provider: "local-mlx",
      id: "mlx-community/Qwen3.8-27B-4bit",
    });
  });
});
