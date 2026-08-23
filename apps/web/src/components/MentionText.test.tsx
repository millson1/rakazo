import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MentionText } from "./MentionText.js";

describe("MentionText", () => {
  it("colors each @Name with that bot's color", () => {
    const html = renderToStaticMarkup(
      <MentionText
        text="Hey @Chief of Staff and @Accountant"
        bots={[
          { id: "chief", name: "Chief of Staff", color: "#3EC5A8" },
          { id: "acct", name: "Accountant", color: "#F5A03C" },
        ]}
      />,
    );
    expect(html).toContain('style="color:#3EC5A8"');
    expect(html).toContain("@Chief of Staff");
    expect(html).toContain('style="color:#F5A03C"');
    expect(html).toContain("@Accountant");
  });
});
