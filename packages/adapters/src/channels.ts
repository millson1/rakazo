import { type JobPublisher, runContinueJob } from "@rakazo/adapter-kit";
import type { Actor, Channel, ChannelDetail, ChannelMessage } from "@rakazo/contracts";
import { botDisplayName, mentionedBotIds, mentionNameAliases } from "@rakazo/core";
import { IsolationError, type PrismaClient } from "@rakazo/db";

const HISTORY_LIMIT = 200;
const CONTEXT_LIMIT = 20;

export interface ChannelDeps {
  prisma: PrismaClient;
  jobs: JobPublisher;
}

type ChannelActor = Pick<Actor, "workspaceId" | "userId">;

interface ChannelRow {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  members: { bot: { id: string; name: string; title: string; color: string } | null }[];
}

interface ChannelMessageRow {
  id: string;
  authorType: string;
  authorBotId: string | null;
  text: string;
  createdAt: Date;
  authorBot: { name: string; color: string } | null;
}

const channelInclude = {
  members: {
    include: { bot: { select: { id: true, name: true, title: true, color: true } } },
    orderBy: { createdAt: "asc" },
  },
} as const;

const messageInclude = {
  authorBot: { select: { name: true, color: true } },
} as const;

function mapChannel(row: ChannelRow, preview: string): Channel {
  return {
    id: row.id,
    name: row.name,
    members: row.members.flatMap((member) =>
      member.bot ? [{ botId: member.bot.id, name: member.bot.name, color: member.bot.color }] : [],
    ),
    preview,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapChannelMessage(row: ChannelMessageRow, userName: string): ChannelMessage {
  const fromBot = row.authorType === "bot";
  return {
    id: row.id,
    authorType: fromBot ? "bot" : "user",
    authorBotId: row.authorBotId,
    authorName: fromBot ? (row.authorBot?.name ?? "Removed bot") : userName,
    authorColor: fromBot ? (row.authorBot?.color ?? null) : null,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireChannel(prisma: PrismaClient, actor: Actor, channelId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, workspaceId: actor.workspaceId, userId: actor.userId },
    include: channelInclude,
  });
  if (!channel) throw new IsolationError();
  return channel;
}

/** Only bots the actor owns can join, so a channel can never reach across workspaces. */
async function ownedBotIds(prisma: PrismaClient, actor: Actor, botIds: string[]) {
  if (botIds.length === 0) return [];
  const rows = await prisma.bot.findMany({
    where: {
      id: { in: [...new Set(botIds)] },
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      archivedAt: null,
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function userDisplayName(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name?.trim() || "You";
}

export async function listChannels(prisma: PrismaClient, actor: Actor): Promise<Channel[]> {
  const rows = await prisma.channel.findMany({
    where: { workspaceId: actor.workspaceId, userId: actor.userId },
    include: {
      ...channelInclude,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => mapChannel(row, row.messages[0]?.text ?? ""));
}

export async function getChannel(
  prisma: PrismaClient,
  actor: Actor,
  channelId: string,
): Promise<ChannelDetail> {
  const channel = await requireChannel(prisma, actor, channelId);
  const [messages, userName] = await Promise.all([
    prisma.channelMessage.findMany({
      where: { channelId: channel.id },
      include: messageInclude,
      orderBy: { createdAt: "asc" },
      take: HISTORY_LIMIT,
    }),
    userDisplayName(prisma, actor.userId),
  ]);
  return {
    ...mapChannel(channel, messages[messages.length - 1]?.text ?? ""),
    messages: messages.map((message) => mapChannelMessage(message, userName)),
  };
}

export async function createChannel(
  prisma: PrismaClient,
  actor: Actor,
  input: { name: string; botIds: string[] },
): Promise<Channel> {
  const name = input.name.trim();
  if (!name) throw new IsolationError("Channel name is required");
  const members = await ownedBotIds(prisma, actor, input.botIds);
  const created = await prisma.channel.create({
    data: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      name,
      members: { create: members.map((botId) => ({ botId })) },
    },
    include: channelInclude,
  });
  return mapChannel(created, "");
}

export async function renameChannel(
  prisma: PrismaClient,
  actor: Actor,
  input: { channelId: string; name: string },
): Promise<Channel> {
  await requireChannel(prisma, actor, input.channelId);
  const updated = await prisma.channel.update({
    where: { id: input.channelId },
    data: { name: input.name.trim() },
    include: channelInclude,
  });
  return mapChannel(updated, "");
}

export async function setChannelMembers(
  prisma: PrismaClient,
  actor: Actor,
  input: { channelId: string; botIds: string[] },
): Promise<Channel> {
  await requireChannel(prisma, actor, input.channelId);
  const members = await ownedBotIds(prisma, actor, input.botIds);
  await prisma.$transaction(async (tx) => {
    await tx.channelMember.deleteMany({
      where: { channelId: input.channelId, botId: { notIn: members.length ? members : ["-"] } },
    });
    for (const botId of members) {
      await tx.channelMember.upsert({
        where: { channelId_botId: { channelId: input.channelId, botId } },
        create: { channelId: input.channelId, botId },
        update: {},
      });
    }
  });
  const updated = await requireChannel(prisma, actor, input.channelId);
  return mapChannel(updated, "");
}

export async function removeChannel(
  prisma: PrismaClient,
  actor: Actor,
  channelId: string,
): Promise<{ ok: true }> {
  await requireChannel(prisma, actor, channelId);
  await prisma.channel.delete({ where: { id: channelId } });
  return { ok: true };
}

/**
 * A user message wakes every workspace bot it names. Mentioning a bot that is not yet a
 * member adds it to the channel, then wakes it. Bot posts wake mentioned bots the same way,
 * except the author.
 */
export async function postUserChannelMessage(
  deps: ChannelDeps,
  actor: Actor,
  input: { channelId: string; text: string },
): Promise<ChannelDetail> {
  const channel = await requireChannel(deps.prisma, actor, input.channelId);
  const text = input.text.trim();
  await deps.prisma.channelMessage.create({
    data: {
      channelId: channel.id,
      authorType: "user",
      userId: actor.userId,
      text,
    },
  });
  await deps.prisma.channel.update({
    where: { id: channel.id },
    data: { updatedAt: new Date() },
  });
  await wakeMentionedChannelBots(deps, actor, channel, text);
  return getChannel(deps.prisma, actor, channel.id);
}

export function formatChannelMemberRoster(
  members: Array<{ name: string; title?: string | null }>,
): string {
  if (members.length === 0) return "no other members yet";
  return members
    .map((member) => {
      const display = botDisplayName(member);
      const title = member.title?.trim() ?? "";
      if (title && title.toLowerCase() !== display.toLowerCase()) {
        return `${display} (${title})`;
      }
      return display;
    })
    .join(", ");
}

export function channelWakePrompt(input: {
  channelName: string;
  channelId: string;
  roster: string;
  transcript: string;
}): string {
  return [
    `You were mentioned in the #${input.channelName} channel.`,
    `You are in this room with ${input.roster}. @Name pulls them in. Reply with post_to_channel using channel_id "${input.channelId}". Keep it short.`,
    input.transcript ? `Recent channel messages:\n${input.transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function channelIdFromWakePrompt(prompt: string): string | null {
  return /channel_id "([^"]+)"/.exec(prompt)?.[1] ?? null;
}

async function wakeMentionedChannelBots(
  deps: ChannelDeps,
  actor: ChannelActor,
  channel: { id: string; name: string; members: ChannelRow["members"] },
  text: string,
  exceptBotId?: string,
): Promise<void> {
  const workspaceBots = await deps.prisma.bot.findMany({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      archivedAt: null,
    },
    select: { id: true, name: true, title: true },
  });
  const candidates = workspaceBots.map((bot) => ({
    botId: bot.id,
    name: bot.name,
    aliases: mentionNameAliases(bot.name, bot.title),
  }));
  const memberIds = new Set(
    channel.members.flatMap((member) => (member.bot ? [member.bot.id] : [])),
  );
  for (const botId of mentionedBotIds(text, candidates)) {
    if (botId === exceptBotId) continue;
    if (!memberIds.has(botId)) {
      await deps.prisma.channelMember.upsert({
        where: { channelId_botId: { channelId: channel.id, botId } },
        create: { channelId: channel.id, botId },
        update: {},
      });
      memberIds.add(botId);
    }
    await wakeChannelBot(deps, actor, { id: channel.id, name: channel.name }, botId).catch(
      (error) => {
        console.error("channel wake", error);
      },
    );
  }
}

async function wakeChannelBot(
  deps: ChannelDeps,
  actor: ChannelActor,
  channel: { id: string; name: string },
  botId: string,
): Promise<void> {
  const bot = await deps.prisma.bot.findFirst({
    where: {
      id: botId,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      archivedAt: null,
    },
    include: { thread: { select: { id: true } } },
  });
  if (!bot?.thread) return;

  const [recent, userName, members] = await Promise.all([
    deps.prisma.channelMessage.findMany({
      where: { channelId: channel.id },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: CONTEXT_LIMIT,
    }),
    userDisplayName(deps.prisma, actor.userId),
    deps.prisma.channelMember.findMany({
      where: { channelId: channel.id },
      include: { bot: { select: { name: true, title: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const transcript = recent
    .slice()
    .reverse()
    .map((message) => {
      const author = message.authorType === "bot" ? (message.authorBot?.name ?? "bot") : userName;
      return `${author}: ${message.text}`;
    })
    .join("\n");
  const roster = formatChannelMemberRoster(
    members.flatMap((member) => (member.bot ? [member.bot] : [])),
  );
  const prompt = channelWakePrompt({
    channelName: channel.name,
    channelId: channel.id,
    roster,
    transcript,
  });

  const task = await deps.prisma.task.create({
    data: {
      workspaceId: actor.workspaceId,
      botId: bot.id,
      threadId: bot.thread.id,
      userId: actor.userId,
      prompt,
      status: "queued",
    },
  });
  const run = await deps.prisma.run.create({
    data: {
      workspaceId: actor.workspaceId,
      botId: bot.id,
      threadId: bot.thread.id,
      taskId: task.id,
      userId: actor.userId,
      status: "queued",
      trigger: "channel",
    },
  });
  await deps.jobs.enqueue(runContinueJob(run.id));
}

export async function postBotChannelMessage(
  deps: { prisma: PrismaClient; jobs?: JobPublisher },
  input: {
    workspaceId: string;
    userId?: string;
    channelId: string;
    botId: string;
    text: string;
    sourceRunId?: string;
  },
): Promise<{ ok: true; channelId: string } | { error: string }> {
  const text = input.text.trim();
  if (!text) return { error: "Message text is required." };
  const membership = await deps.prisma.channelMember.findFirst({
    where: {
      channelId: input.channelId,
      botId: input.botId,
      channel: { workspaceId: input.workspaceId },
    },
    select: {
      id: true,
      channel: {
        select: {
          id: true,
          name: true,
          userId: true,
          members: {
            include: { bot: { select: { id: true, name: true, title: true, color: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!membership) return { error: "You are not a member of that channel." };
  await deps.prisma.channelMessage.create({
    data: {
      channelId: input.channelId,
      authorType: "bot",
      authorBotId: input.botId,
      text,
      sourceRunId: input.sourceRunId,
    },
  });
  await deps.prisma.channel.update({
    where: { id: input.channelId },
    data: { updatedAt: new Date() },
  });
  const userId = input.userId ?? membership.channel.userId;
  if (deps.jobs && userId) {
    await wakeMentionedChannelBots(
      { prisma: deps.prisma, jobs: deps.jobs },
      { workspaceId: input.workspaceId, userId },
      membership.channel,
      text,
      input.botId,
    );
  }
  return { ok: true, channelId: input.channelId };
}
