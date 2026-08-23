import { describe, expect, it } from "vitest";
import { mentionedBotIds, mentionQueryAt, mentionRanges } from "./channel-mentions.js";

const members = [
  { botId: "chief", name: "Chief" },
  { botId: "chief-of-staff", name: "Chief of Staff" },
  { botId: "accountant", name: "Accountant" },
];

describe("channel mentions", () => {
  it("wakes nobody when no one is named", () => {
    expect(mentionedBotIds("shipping the release today", members)).toEqual([]);
  });

  it("wakes only the mentioned member", () => {
    expect(mentionedBotIds("@Accountant can you check the invoice", members)).toEqual([
      "accountant",
    ]);
  });

  it("is case insensitive", () => {
    expect(mentionedBotIds("hey @accountant", members)).toEqual(["accountant"]);
  });

  it("prefers the longest matching name so a prefix bot is not also woken", () => {
    expect(mentionedBotIds("@Chief of Staff please take this", members)).toEqual([
      "chief-of-staff",
    ]);
  });

  it("still wakes the shorter name when it is the one mentioned", () => {
    expect(mentionedBotIds("@Chief please take this", members)).toEqual(["chief"]);
  });

  it("wakes several members at once", () => {
    const woken = mentionedBotIds("@Chief of Staff and @Accountant sync up", members);
    expect(woken.sort()).toEqual(["accountant", "chief-of-staff"]);
  });

  it("ignores a bare name with no at sign", () => {
    expect(mentionedBotIds("Accountant should look at this", members)).toEqual([]);
  });

  it("matches slug aliases so a kebab name still wakes the titled bot", () => {
    expect(
      mentionedBotIds("@email-responder please look", [
        {
          botId: "mail",
          name: "Email Responder",
          aliases: ["email-responder"],
        },
      ]),
    ).toEqual(["mail"]);
  });

  it("does not wake the same bot twice when name and alias both match", () => {
    expect(
      mentionedBotIds("@Email Responder", [
        { botId: "mail", name: "Email Responder", aliases: ["Email Responder"] },
      ]),
    ).toEqual(["mail"]);
  });
});

describe("mention ranges", () => {
  it("covers the longest matching name so a prefix bot is not also highlighted", () => {
    expect(mentionRanges("@Chief of Staff please take this", members)).toEqual([
      { start: 0, end: "@Chief of Staff".length, botId: "chief-of-staff" },
    ]);
  });

  it("is case insensitive", () => {
    expect(mentionRanges("hey @accountant", members)).toEqual([
      { start: 4, end: 4 + "@accountant".length, botId: "accountant" },
    ]);
  });

  it("matches slug aliases", () => {
    expect(
      mentionRanges("@email-responder please look", [
        {
          botId: "mail",
          name: "Email Responder",
          aliases: ["email-responder"],
        },
      ]),
    ).toEqual([{ start: 0, end: "@email-responder".length, botId: "mail" }]);
  });

  it("still ranges the shorter name when it is the one mentioned", () => {
    expect(mentionRanges("@Chief please take this", members)).toEqual([
      { start: 0, end: "@Chief".length, botId: "chief" },
    ]);
  });
});

describe("mention query at cursor", () => {
  it("opens after a lone at sign", () => {
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("hi @em", 6)).toEqual({ start: 3, query: "em" });
  });

  it("does not open in the middle of a word", () => {
    expect(mentionQueryAt("foo@bar", 4)).toBeNull();
    expect(mentionQueryAt("hello there", 5)).toBeNull();
  });
});
