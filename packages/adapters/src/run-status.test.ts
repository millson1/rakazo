import type { AdapterContext, AgentRuntime } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import {
  handleSayTool,
  publishRunStatusIfDue,
  shouldEmitRunStatus,
  statusTitlesFromSteps,
} from "./run-status.js";

const context: AdapterContext = {
  operationId: "run-1",
  traceId: "run-1",
  workspaceId: "ws-1",
  userId: "user-1",
  signal: new AbortController().signal,
};

describe("shouldEmitRunStatus", () => {
  it("waits 60s from start and skips a recent say", () => {
    expect(
      shouldEmitRunStatus({ now: 59_000, startedAt: 0, lastSayAt: 0, lastStatusAt: 0 }),
    ).toBe(false);
    expect(
      shouldEmitRunStatus({ now: 60_000, startedAt: 0, lastSayAt: 0, lastStatusAt: 0 }),
    ).toBe(true);
    expect(
      shouldEmitRunStatus({ now: 80_000, startedAt: 0, lastSayAt: 70_000, lastStatusAt: 0 }),
    ).toBe(false);
  });
});

describe("statusTitlesFromSteps", () => {
  it("keeps running and done titles only", () => {
    expect(
      statusTitlesFromSteps([
        { id: "1", kind: "tool", title: "Reading a file", status: "done" },
        { id: "2", kind: "tool", title: "Running a command", status: "running" },
        { id: "3", kind: "status", title: "Starting", status: "running" },
      ]),
    ).toEqual(["Reading a file", "Running a command", "Starting"]);
  });
});

describe("handleSayTool", () => {
  it("creates a thread message", async () => {
    const published: string[] = [];
    const result = await handleSayTool({
      args: { text: "Still compiling the installer." },
      secrets: [],
      publish: async (text) => {
        published.push(text);
      },
    });
    expect(result).toEqual({ ok: true });
    expect(published).toEqual(["Still compiling the installer."]);
  });
});

describe("publishRunStatusIfDue", () => {
  it("skips the status line when no cheap model is available", async () => {
    const runtime = {
      run: vi.fn<AgentRuntime["run"]>(async function* () {
        yield { type: "done", text: "should not run" };
      }),
    };
    const published: string[] = [];
    const result = await publishRunStatusIfDue({
      now: 120_000,
      startedAt: 0,
      lastSayAt: 0,
      lastStatusAt: 0,
      steps: [{ id: "1", kind: "tool", title: "Reading a file", status: "running" }],
      runtime: runtime as unknown as AgentRuntime,
      context,
      botId: "bot-1",
      threadId: "thread-1",
      runId: "run-1",
      secrets: [],
      publish: async (text) => {
        published.push(text);
      },
    });
    expect(result).toBe("skipped");
    expect(runtime.run).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });
});
