import type { JobPublisher } from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  channelIdFromWakePrompt,
  channelWakePrompt,
  formatChannelMemberRoster,
  postBotChannelMessage,
} from "./channels.js";

describe("channel wake prompt", () => {
  it("lists members and tells the bot how to pull others in", () => {
    const prompt = channelWakePrompt({
      channelName: "ops",
      channelId: "ch-1",
      roster: "Alpha (Engineer), Beta",
      transcript: "Ada: @Alpha ping",
    });
    expect(prompt).toContain("#ops");
    expect(prompt).toContain("You are in this room with Alpha (Engineer), Beta");
    expect(prompt).toContain("@Name pulls them in");
    expect(prompt).toContain("post_to_channel");
    expect(prompt).toContain('channel_id "ch-1"');
    expect(channelIdFromWakePrompt(prompt)).toBe("ch-1");
  });

  it("shows titles only when they add information", () => {
    expect(
      formatChannelMemberRoster([
        { name: "Alpha", title: "Engineer" },
        { name: "Beta", title: "Beta" },
        { name: "Gamma", title: "" },
      ]),
    ).toBe("Alpha (Engineer), Beta, Gamma");
  });
});

describe("postBotChannelMessage mentions", () => {
  it("wakes mentioned bots except the author and auto-joins them", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue({});
    const taskCreate = vi.fn().mockResolvedValue({ id: "task-beta" });
    const runCreate = vi.fn().mockResolvedValue({ id: "run-beta" });
    const botFindFirst = vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id !== "beta") return null;
      return { id: "beta", name: "Beta", title: "Ops", thread: { id: "thread-beta" } };
    });
    const prisma = {
      channelMember: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-alpha",
          channel: {
            id: "ch-1",
            name: "ops",
            userId: "user-1",
            members: [
              {
                bot: { id: "alpha", name: "Alpha", title: "Lead", color: "#000" },
              },
            ],
          },
        }),
        upsert,
        findMany: vi.fn().mockResolvedValue([
          { bot: { name: "Alpha", title: "Lead" } },
          { bot: { name: "Beta", title: "Ops" } },
        ]),
      },
      channelMessage: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          {
            authorType: "bot",
            authorBot: { name: "Alpha" },
            text: "@Beta please look",
          },
        ]),
      },
      channel: { update: vi.fn().mockResolvedValue({}) },
      bot: {
        findMany: vi.fn().mockResolvedValue([
          { id: "alpha", name: "Alpha", title: "Lead" },
          { id: "beta", name: "Beta", title: "Ops" },
        ]),
        findFirst: botFindFirst,
      },
      user: { findUnique: vi.fn().mockResolvedValue({ name: "Ada" }) },
      task: { create: taskCreate },
      run: { create: runCreate },
    } as unknown as PrismaClient;

    expect(
      await postBotChannelMessage(
        { prisma, jobs: { enqueue } as unknown as JobPublisher },
        {
          workspaceId: "ws-1",
          userId: "user-1",
          channelId: "ch-1",
          botId: "alpha",
          text: "@Alpha and @Beta please look",
        },
      ),
    ).toEqual({ ok: true, channelId: "ch-1" });

    expect(upsert).toHaveBeenCalledWith({
      where: { channelId_botId: { channelId: "ch-1", botId: "beta" } },
      create: { channelId: "ch-1", botId: "beta" },
      update: {},
    });
    expect(botFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "beta" }) }),
    );
    expect(runCreate).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(runContinueJob("run-beta"));
    const prompt = taskCreate.mock.calls[0]?.[0]?.data?.prompt as string;
    expect(prompt).toContain("You are in this room with Alpha (Lead), Beta (Ops)");
    expect(prompt).toContain("@Name pulls them in");
    expect(prompt).toContain('channel_id "ch-1"');
  });

  it("does not wake anyone when the bot post has no mentions", async () => {
    const enqueue = vi.fn();
    const prisma = {
      channelMember: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mem-alpha",
          channel: {
            id: "ch-1",
            name: "ops",
            userId: "user-1",
            members: [{ bot: { id: "alpha", name: "Alpha", title: "", color: "#000" } }],
          },
        }),
        upsert: vi.fn(),
      },
      channelMessage: { create: vi.fn().mockResolvedValue({}) },
      channel: { update: vi.fn().mockResolvedValue({}) },
      bot: {
        findMany: vi.fn().mockResolvedValue([{ id: "alpha", name: "Alpha", title: "" }]),
        findFirst: vi.fn(),
      },
    } as unknown as PrismaClient;

    expect(
      await postBotChannelMessage(
        { prisma, jobs: { enqueue } as unknown as JobPublisher },
        {
          workspaceId: "ws-1",
          userId: "user-1",
          channelId: "ch-1",
          botId: "alpha",
          text: "On it.",
        },
      ),
    ).toEqual({ ok: true, channelId: "ch-1" });
    expect(enqueue).not.toHaveBeenCalled();
    expect(prisma.bot.findFirst).not.toHaveBeenCalled();
  });
});
