import type { Bot, ChannelDetail } from "@rakazo/contracts";
import {
  botDisplayName,
  filterMentionableBots,
  formatChatTimestamp,
  mentionedBotIds,
  mentionNameAliases,
  mentionQueryAt,
  shouldShowChatTimestamp,
} from "@rakazo/core";
import { BotAvatar } from "@rakazo/ui-web";
import { ArrowUp, Check, Hash, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MentionText } from "../components/MentionText";
import { rpc } from "../lib/rpc";

// Mentioned bots answer through an agent tool long after the post resolves, so their replies
// only ever show up on a refetch.
const CHANNEL_POLL_MS = 4_000;
const FALLBACK_BOT_COLOR = "#6C6C70";

export function ChannelView({
  channelId,
  bots,
  onChannelChanged,
  onDeleted,
}: {
  channelId: string;
  bots: Bot[];
  onChannelChanged: () => void;
  onDeleted: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Escape unmounts the rename input, and the blur that follows would otherwise commit the
  // edit the user just abandoned.
  const renameAbandoned = useRef(false);
  const [detail, setDetail] = useState<ChannelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [posting, setPosting] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  // A poll that started before a post or a member change must not overwrite the authoritative
  // detail those mutations return, so every apply is gated on the newest issued request.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await rpc.channels.get({ channelId });
      if (seq !== requestSeq.current) return;
      setDetail(next);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Could not open this channel");
    }
  }, [channelId]);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setDraft("");
    setMembersOpen(false);
    setEditingName(false);
    setDeleteOpen(false);
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const poll = window.setInterval(refreshWhenVisible, CHANNEL_POLL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [channelId, detail?.messages.length]);

  useEffect(() => {
    if (!membersOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!membersRef.current?.contains(event.target as Node)) setMembersOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMembersOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [membersOpen]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const memberIds = useMemo(
    () => (detail?.members ?? []).map((member) => member.botId),
    [detail?.members],
  );
  const mentionCandidates = useMemo(
    () =>
      bots.map((bot) => ({
        botId: bot.id,
        name: bot.name,
        aliases: mentionNameAliases(bot.name, bot.title),
      })),
    [bots],
  );
  const mention = mentionQueryAt(draft, cursor);
  const mentionMatches = useMemo(
    () => (mention ? filterMentionableBots(bots, mention.query) : []),
    [bots, mention],
  );
  const unaddressed =
    draft.trim().length > 0 && mentionedBotIds(draft, mentionCandidates).length === 0;

  useEffect(() => {
    setMentionIndex(0);
    setMentionDismissed(false);
  }, [mention?.query, mentionMatches.length]);

  function insertMention(bot: Bot) {
    if (!mention) return;
    const label = botDisplayName(bot);
    const before = draft.slice(0, mention.start);
    const after = draft.slice(cursor).replace(/^\s*/, "");
    const next = `${before}@${label} ${after}`;
    const nextCursor = before.length + label.length + 2;
    setDraft(next);
    setCursor(nextCursor);
  }

  async function post() {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const seq = ++requestSeq.current;
      const next = await rpc.channels.post({ channelId, text });
      setDraft("");
      if (seq === requestSeq.current) setDetail(next);
      onChannelChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that message");
    } finally {
      setPosting(false);
    }
  }

  async function saveMembers(botIds: string[]) {
    if (savingMembers) return;
    setSavingMembers(true);
    setError(null);
    try {
      const seq = ++requestSeq.current;
      const channel = await rpc.channels.setMembers({ channelId, botIds });
      if (seq === requestSeq.current) {
        setDetail((current) => (current ? { ...current, ...channel } : current));
      }
      onChannelChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the members");
    } finally {
      setSavingMembers(false);
    }
  }

  async function commitRename() {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!detail || !name || name === detail.name) return;
    setError(null);
    try {
      const seq = ++requestSeq.current;
      const channel = await rpc.channels.rename({ channelId, name });
      if (seq === requestSeq.current) {
        setDetail((current) => (current ? { ...current, ...channel } : current));
      }
      onChannelChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this channel");
    }
  }

  return (
    <main
      data-testid="channel-view"
      data-channel-id={channelId}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--rk-main)]"
    >
      <div className="rk-titlebar rk-caption-pad app-drag flex items-center justify-between gap-3 px-[var(--rk-header-x)]">
        <div className="app-no-drag flex min-w-0 items-center gap-2">
          {editingName ? (
            <input
              ref={nameInputRef}
              maxLength={80}
              aria-label="Channel name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                if (renameAbandoned.current) {
                  renameAbandoned.current = false;
                  return;
                }
                void commitRename();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                }
                if (event.key === "Escape") {
                  renameAbandoned.current = true;
                  setEditingName(false);
                }
              }}
              className="h-7 w-[240px] rounded-[8px] border border-[#343438] bg-[#101012] px-2 text-[14px] font-medium text-[#ECECEE] outline-none focus:border-[#66666D]"
            />
          ) : (
            <button
              type="button"
              disabled={!detail}
              title="Rename channel"
              onClick={() => {
                setNameDraft(detail?.name ?? "");
                setEditingName(true);
              }}
              className="flex min-w-0 items-center gap-1.5"
            >
              <Hash size={14} strokeWidth={2} className="shrink-0 text-[#6C6C70]" />
              <span className="truncate text-[14px] font-medium text-[#ECECEE]">
                {detail?.name ?? "Channel"}
              </span>
            </button>
          )}
        </div>
        <div ref={membersRef} className="app-no-drag relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={membersOpen}
            aria-label="Manage members"
            title="Manage members"
            onClick={() => setMembersOpen((open) => !open)}
            className="grid h-7 w-8 place-items-center rounded-[8px] hover:bg-[#1B1B1E]"
            style={{ background: membersOpen ? "#1B1B1E" : "transparent" }}
          >
            <Users size={17} strokeWidth={1.6} className="text-[#A8A8AD]" />
          </button>
          <button
            type="button"
            aria-label="Delete channel"
            title="Delete channel"
            onClick={() => {
              setMembersOpen(false);
              setDeleteOpen(true);
            }}
            className="grid h-7 w-8 place-items-center rounded-[8px] hover:bg-[#1B1B1E]"
          >
            <Trash2 size={16} strokeWidth={1.6} className="text-[#A8A8AD]" />
          </button>
          {membersOpen ? (
            <div
              role="menu"
              aria-label="Channel members"
              className="rk-scroll absolute right-0 top-[38px] z-30 max-h-[340px] w-[264px] overflow-y-auto rounded-[18px] border border-[#343438] bg-[#1A1A1D] p-2 shadow-[0_24px_60px_rgba(0,0,0,.62)]"
            >
              {bots.length === 0 ? (
                <p className="px-3 py-2 text-[13.5px] text-[#85858A]">You have no bots yet.</p>
              ) : null}
              {bots.map((bot) => {
                const joined = memberIds.includes(bot.id);
                return (
                  <button
                    key={bot.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={joined}
                    disabled={savingMembers}
                    onClick={() =>
                      void saveMembers(
                        joined ? memberIds.filter((id) => id !== bot.id) : [...memberIds, bot.id],
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[15px] text-[#ECECEE] outline-none hover:bg-[#29292D] focus-visible:bg-[#29292D] disabled:opacity-50"
                  >
                    <BotAvatar color={bot.color} size={20} />
                    <span className="min-w-0 flex-1 truncate">{botDisplayName(bot)}</span>
                    {joined ? (
                      <Check size={16} strokeWidth={2} className="shrink-0 text-[#4ECB71]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={scrollRef}
        data-testid="channel-transcript"
        className="rk-transcript rk-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--rk-gutter)] py-3 sm:px-4"
      >
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2.5">
          {!detail && error ? (
            <p className="py-16 text-center text-[14px] text-[#85858A]">{error}</p>
          ) : null}
          {detail?.messages.length === 0 ? (
            <p className="py-16 text-center text-[14px] text-[#6C6C70]">
              No messages yet. @mention a bot to bring it into the conversation.
            </p>
          ) : null}
          {detail?.messages.map((message, index) => (
            <div key={message.id}>
              {shouldShowChatTimestamp(detail.messages[index - 1]?.createdAt, message.createdAt) ? (
                <div className="pb-3 text-center text-[12.5px] text-[#6C6C70]">
                  {formatChatTimestamp(message.createdAt)}
                </div>
              ) : null}
              {message.authorType === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[70%] whitespace-pre-wrap rounded-[var(--rk-radius-bubble)] bg-[var(--rk-bubble-user)] px-[var(--rk-bubble-x)] py-[var(--rk-bubble-y)] text-[14.5px] leading-[1.45] text-[#ECECEE]">
                    <MentionText text={message.text} bots={bots} />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <BotAvatar color={message.authorColor ?? FALLBACK_BOT_COLOR} size={22} />
                  <div className="min-w-0 max-w-[min(560px,82%)]">
                    <div
                      className="mb-0.5 text-[12px] font-medium"
                      style={{ color: message.authorColor ?? FALLBACK_BOT_COLOR }}
                    >
                      {message.authorName}
                    </div>
                    <div className="whitespace-pre-wrap rounded-[var(--rk-radius-bubble)] bg-[var(--rk-bubble-bot)] px-[var(--rk-bubble-x)] py-[var(--rk-bubble-y)] text-[14.5px] leading-[1.5] text-[#DFDFE2]">
                      <MentionText text={message.text} bots={bots} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="px-[var(--rk-gutter)] pb-3 pt-2 sm:px-4">
        <div className="relative w-full">
          {detail && error ? (
            <div className="mb-2 rounded-[10px] border border-[#5A2A2A] bg-[#2A1717] px-3 py-1.5 text-[12.5px] text-[#F1A8A8]">
              {error}
            </div>
          ) : null}
          {mention && !mentionDismissed && mentionMatches.length > 0 ? (
            <div
              role="listbox"
              aria-label="Mention a bot"
              className="rk-scroll absolute bottom-full left-0 right-12 z-20 mb-1 max-h-[220px] overflow-y-auto rounded-[10px] border border-[#343438] bg-[#1A1A1D] p-1 shadow-[0_16px_40px_rgba(0,0,0,.55)]"
            >
              {mentionMatches.map((bot, index) => (
                <button
                  key={bot.id}
                  type="button"
                  role="option"
                  aria-selected={index === mentionIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(bot);
                  }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13.5px] text-[#ECECEE]"
                  style={{ background: index === mentionIndex ? "#29292D" : "transparent" }}
                >
                  <BotAvatar color={bot.color} size={18} />
                  <span className="min-w-0 flex-1 truncate">{botDisplayName(bot)}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 rounded-full border border-[#202023] bg-[#131315] py-[var(--rk-composer-y)] pl-3.5 pr-1.5">
            <input
              value={draft}
              disabled={!detail}
              onChange={(event) => {
                setDraft(event.target.value);
                setCursor(event.target.selectionStart ?? event.target.value.length);
              }}
              onClick={(event) => setCursor(event.currentTarget.selectionStart ?? draft.length)}
              onKeyUp={(event) => setCursor(event.currentTarget.selectionStart ?? draft.length)}
              onKeyDown={(event) => {
                if (mention && !mentionDismissed && mentionMatches.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionIndex((index) => (index + 1) % mentionMatches.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionIndex(
                      (index) => (index - 1 + mentionMatches.length) % mentionMatches.length,
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    const selected = mentionMatches[mentionIndex];
                    if (selected) {
                      event.preventDefault();
                      insertMention(selected);
                      return;
                    }
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMentionDismissed(true);
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void post();
                }
              }}
              placeholder={
                detail
                  ? `Message #${detail.name} — @mention a bot to bring it in`
                  : "Opening channel…"
              }
              className="flex-1 bg-transparent text-[14.5px] text-[#E9E9EA] outline-none disabled:opacity-40"
            />
            <button
              type="button"
              aria-label="Send"
              disabled={!detail || posting || draft.trim().length === 0}
              onClick={() => void post()}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A] disabled:opacity-40"
            >
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          </div>
          <p className="mt-1.5 h-4 px-3 text-[12px] text-[#6C6C70]">
            {unaddressed ? "No bot mentioned — nobody will reply to this message." : null}
          </p>
        </div>
      </div>
      {deleteOpen && detail ? (
        <DeleteChannelDialog
          name={detail.name}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await rpc.channels.remove({ channelId });
            onDeleted();
          }}
        />
      ) : null}
    </main>
  );
}

function DeleteChannelDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-channel-title"
        aria-describedby="delete-channel-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[#343438] bg-[#1A1A1D] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-channel-title" className="text-[17px] font-medium text-[#F1F1F2]">
          Delete #{name}?
        </h2>
        <p id="delete-channel-description" className="mt-2 text-[14px] leading-6 text-[#9A9AA0]">
          Every message in this channel is permanently deleted. The bots that were in it stay in
          your list.
        </p>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[#C9C9CE] hover:bg-[#29292D] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setError(null);
              void onConfirm().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Could not delete this channel");
                setDeleting(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
