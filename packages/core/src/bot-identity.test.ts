import { describe, expect, it } from "vitest";
import {
  botDisplayName,
  botMatchesName,
  filterMentionableBots,
  humanizeSpawnedBot,
  inboxPreviewFromBlocks,
  looksLikeSlug,
  mentionNameAliases,
  slugifyName,
  titleCaseSlug,
} from "./bot-identity.js";

describe("bot identity", () => {
  it("title-cases kebab and snake slugs", () => {
    expect(looksLikeSlug("email-responder")).toBe(true);
    expect(looksLikeSlug("email_responder")).toBe(true);
    expect(looksLikeSlug("Email Responder")).toBe(false);
    expect(looksLikeSlug("Scout")).toBe(false);
    expect(titleCaseSlug("email-responder")).toBe("Email Responder");
    expect(titleCaseSlug("e-mail-responder")).toBe("E Mail Responder");
    expect(slugifyName("Email Responder")).toBe("email-responder");
  });

  it("prefers a human title over a kebab name", () => {
    expect(botDisplayName({ name: "email-responder", title: "Email Responder" })).toBe(
      "Email Responder",
    );
    expect(botDisplayName({ name: "email-responder", title: "" })).toBe("Email Responder");
    expect(botDisplayName({ name: "Chief of Staff", title: "Ops" })).toBe("Chief of Staff");
  });

  it("matches typed mentions against name, title, and slug aliases", () => {
    const bot = { name: "email-responder", title: "Email Responder" };
    expect(mentionNameAliases(bot.name, bot.title)).toEqual(
      expect.arrayContaining(["email-responder", "Email Responder"]),
    );
    expect(botMatchesName(bot, "email-responder")).toBe(true);
    expect(botMatchesName(bot, "Email Responder")).toBe(true);
    expect(filterMentionableBots([bot, { name: "Scout", title: "" }], "email")).toEqual([bot]);
  });

  it("fills a spaced name, title, and description when a spawn tool sends a slug", () => {
    expect(
      humanizeSpawnedBot({
        name: "email-responder",
        title: "Email Responder",
        description: "",
      }),
    ).toEqual({
      name: "Email Responder",
      title: "Email Responder",
      description: "Email Responder handles assigned work in this workspace.",
    });
    expect(
      humanizeSpawnedBot({
        name: "inbox-triage",
        description: "Reads new mail and drafts replies.",
      }),
    ).toEqual({
      name: "Inbox Triage",
      title: "Inbox Triage",
      description: "Reads new mail and drafts replies.",
    });
  });

  it("keeps sidebar previews to a one-line bot-message header", () => {
    expect(
      inboxPreviewFromBlocks([
        { kind: "bot_message", direction: "in", peerName: "Bot", text: "Open Gmail on your computer" },
      ]),
    ).toBe("Message from Bot");
    expect(
      inboxPreviewFromBlocks([
        { kind: "computer", text: "Gmail requires Google account sign-in." },
      ]),
    ).toBe("Gmail requires Google account sign-in.");
  });
});
