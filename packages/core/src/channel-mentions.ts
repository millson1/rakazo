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

export function mentionRanges(
  text: string,
  members: MentionCandidate[],
): Array<{ start: number; end: number; botId: string }> {
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
  const lower = text.toLowerCase();
  const taken = new Array<boolean>(text.length).fill(false);
  const ranges: Array<{ start: number; end: number; botId: string }> = [];
  const seen = new Set<string>();
  for (const item of needles) {
    if (seen.has(item.botId)) continue;
    let from = 0;
    while (from < lower.length) {
      const start = lower.indexOf(item.needle, from);
      if (start < 0) break;
      const end = start + item.needle.length;
      const overlaps = taken.slice(start, end).some(Boolean);
      if (!overlaps) {
        for (let i = start; i < end; i += 1) taken[i] = true;
        ranges.push({ start, end, botId: item.botId });
        seen.add(item.botId);
        break;
      }
      from = start + 1;
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
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
