export interface MentionCandidate {
  botId: string;
  name: string;
  aliases?: string[];
}

/**
 * Bots in a channel only speak when they are named, so a posted message wakes exactly the
 * members it mentions. Longer names match first and are consumed, so "@Chief of Staff" does
 * not also wake a bot called "Chief".
 */
export function mentionedBotIds(text: string, members: MentionCandidate[]): string[] {
  const needles: { botId: string; needle: string }[] = [];
  for (const member of members) {
    const names = [member.name, ...(member.aliases ?? [])];
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      needles.push({ botId: member.botId, needle: `@${trimmed.toLowerCase()}` });
    }
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);
  let remaining = text.toLowerCase();
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const item of needles) {
    if (seen.has(item.botId) || !remaining.includes(item.needle)) continue;
    remaining = remaining.split(item.needle).join(" ");
    seen.add(item.botId);
    hits.push(item.botId);
  }
  return hits;
}

/** The incomplete @query at the cursor, if the user is typing a mention. */
export function mentionQueryAt(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const index = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, index);
  const match = /(?:^|[\s([{'"])@([^\s@]*)$/.exec(before);
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: before.length - query.length - 1, query };
}
