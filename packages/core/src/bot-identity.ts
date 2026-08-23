const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/;

export function looksLikeSlug(value: string): boolean {
  return SLUG.test(value.trim());
}

/** Title-case a kebab/snake slug: `email-responder` → `Email Responder`. */
export function titleCaseSlug(value: string): string {
  const parts = value
    .trim()
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return value.trim();
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

export function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Names the UI should show: spaced Title Case, never a kebab slug when a title exists. */
export function botDisplayName(bot: { name: string; title?: string | null }): string {
  const name = bot.name.trim();
  const title = bot.title?.trim() ?? "";
  if (looksLikeSlug(name) && title && !looksLikeSlug(title)) return title;
  if (looksLikeSlug(name)) return titleCaseSlug(name);
  return name || title || "Bot";
}

export function mentionNameAliases(name: string, title?: string | null): string[] {
  const display = botDisplayName({ name, title });
  return uniqueNames([
    name,
    title,
    display,
    looksLikeSlug(name) ? titleCaseSlug(name) : undefined,
    slugifyName(name),
    title ? slugifyName(title) : undefined,
    slugifyName(display),
  ]);
}

export function botMatchesName(
  bot: { name: string; title?: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return mentionNameAliases(bot.name, bot.title).some((alias) => alias.toLowerCase() === needle);
}

export function filterMentionableBots<T extends { name: string; title?: string | null }>(
  bots: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return bots;
  return bots.filter((bot) =>
    mentionNameAliases(bot.name, bot.title).some((alias) => alias.toLowerCase().includes(needle)),
  );
}

function firstSentence(text: string | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "";
  const match = trimmed.match(/^[^.!?\n]+[.!?]?/);
  const sentence = (match?.[0] ?? trimmed).replace(/\s+/g, " ").trim();
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence;
}

export function humanizeSpawnedBot(input: {
  name: string;
  title?: string;
  description?: string;
  instructions?: string;
}): { name: string; title: string; description: string } {
  const rawName = input.name.trim();
  const rawTitle = (input.title ?? "").trim();
  const nameSource = rawName || rawTitle;
  const name = looksLikeSlug(nameSource) ? titleCaseSlug(nameSource) : nameSource || "Bot";
  const titleSource = rawTitle || name;
  const title = looksLikeSlug(titleSource) ? titleCaseSlug(titleSource) : titleSource;
  const description =
    (input.description ?? "").trim() ||
    firstSentence(input.instructions) ||
    `${title} handles assigned work in this workspace.`;
  return { name, title, description };
}

export function inboxPreviewFromBlocks(
  blocks: Array<{
    kind?: string;
    text?: string;
    direction?: string;
    peerName?: string;
  }>,
): string {
  const computer = blocks.find((block) => block.kind === "computer");
  if (computer?.text) return computer.text;
  const botMessage = blocks.find((block) => block.kind === "bot_message");
  if (botMessage) {
    const peer = botMessage.peerName?.trim() || "bot";
    return botMessage.direction === "out" ? `Messaged ${peer}` : `Message from ${peer}`;
  }
  return blocks.find((block) => block.text)?.text ?? "";
}
