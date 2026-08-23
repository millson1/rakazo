import { mentionNameAliases, mentionRanges } from "@rakazo/core";
import { useMemo } from "react";

export type MentionBot = {
  id: string;
  name: string;
  title?: string | null;
  color: string;
};

export function MentionText({ text, bots }: { text: string; bots: MentionBot[] }) {
  const members = useMemo(
    () =>
      bots.map((bot) => ({
        botId: bot.id,
        name: bot.name,
        aliases: mentionNameAliases(bot.name, bot.title),
      })),
    [bots],
  );
  const colorById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot.color])), [bots]);
  const ranges = useMemo(() => mentionRanges(text, members), [text, members]);

  if (ranges.length === 0) return <>{text}</>;

  const parts: Array<{ key: string; value: string; color?: string }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({ key: `t:${cursor}`, value: text.slice(cursor, range.start) });
    }
    parts.push({
      key: `${range.botId}:${range.start}`,
      value: text.slice(range.start, range.end),
      color: colorById.get(range.botId),
    });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ key: `t:${cursor}`, value: text.slice(cursor) });

  return (
    <>
      {parts.map((part) =>
        part.color ? (
          <span key={part.key} style={{ color: part.color }}>
            {part.value}
          </span>
        ) : (
          <span key={part.key}>{part.value}</span>
        ),
      )}
    </>
  );
}
