import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorTokensFromCss, lintAuthEmailTemplate, normalizeHex } from "./authEmailTemplates";

// GOALS.md §32d — reads the real files pasted into the Firebase console (web/email/) and the real stylesheet.
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const FILES = ["verify-email.html", "reset-password.html", "change-email.html"] as const;
const SUBJECTS = [
  "Confirme seu e-mail no %APP_NAME%",
  "Redefina sua senha do %APP_NAME%",
  "Confirme seu novo e-mail no %APP_NAME%",
];

const colors = colorTokensFromCss(read("../app/globals.css"));
const readme = read("../../email/README.md");
const newEmailConfirmed = readme.includes("`%NEW_EMAIL%` confirmed");

describe("the palette read from globals.css", () => {
  it("has the direction-B tokens the templates are drawn with", () => {
    for (const hex of ["#12161c", "#c2410c", "#fb923c", "#faf9f7", "#ffffff", "#e6e3de", "#f1eee9", "#575c66"]) {
      expect(colors.has(hex), hex).toBe(true);
    }
  });

  it("treats the short and long form of a colour as the same", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#C2410C")).toBe("#c2410c");
  });
});

describe.each(FILES)("web/email/%s", (file) => {
  const html = read(`../../email/${file}`);

  it("passes the template rules", () => {
    expect(lintAuthEmailTemplate(html, colors, { allowNewEmail: newEmailConfirmed && file === "change-email.html" })).toEqual([]);
  });

  it("is named in the README next to the console template it goes into", () => {
    expect(readme).toContain(file);
  });
});

describe("web/email/README.md", () => {
  it("records each subject line", () => {
    for (const subject of SUBJECTS) expect(readme).toContain(subject);
  });

  it("does not put a reply-to address in a repository that may be public", () => {
    expect(readme).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});

describe("lintAuthEmailTemplate", () => {
  const good = read("../../email/verify-email.html");
  const lint = (html: string) => lintAuthEmailTemplate(html, colors);

  it("fails a template with an <img> added", () => {
    expect(lint(good.replace("<h1", '<img src="logo.png" alt="Logo"><h1'))).toContain("<img> is not allowed (inline styles and text only)");
  });

  it("fails <style>, <script>, remote addresses and javascript: links", () => {
    expect(lint(`<style>a{}</style>${good}`).some((p) => p.includes("<style>"))).toBe(true);
    expect(lint(`<script>x()</script>${good}`).some((p) => p.includes("<script>"))).toBe(true);
    expect(lint(good.replace("<h1", '<a href="https://example.com">x</a><h1')).some((p) => p.includes("http(s)"))).toBe(true);
    expect(lint(good.replace("<h1", '<a href="javascript:alert(1)">x</a><h1')).some((p) => p.includes("javascript:"))).toBe(true);
  });

  it("fails a colour that is not a token of the site", () => {
    expect(lint(good.replace("#c2410c", "#123456")).some((p) => p.includes("#123456"))).toBe(true);
  });

  it("fails when the link is missing as a button or as visible fallback text", () => {
    expect(lint(good.replaceAll('href="%LINK%"', 'href="#"')).length).toBeGreaterThan(0);
    expect(lint(good.replace(">%LINK%</a>", ">clique aqui</a>"))).toContain(
      "needs %LINK% as visible text (the fallback when the button does not open)",
    );
  });

  it("fails %DISPLAY_NAME%, an unknown placeholder and %NEW_EMAIL% until it is allowed", () => {
    expect(lint(good.replace("%EMAIL%", "%DISPLAY_NAME%")).some((p) => p.includes("DISPLAY_NAME"))).toBe(true);
    expect(lint(good.replace("%EMAIL%", "%SOMETHING%")).some((p) => p.includes("%SOMETHING%"))).toBe(true);
    const withNew = good.replace("%EMAIL%", "%NEW_EMAIL%");
    expect(lint(withNew).some((p) => p.includes("NEW_EMAIL"))).toBe(true);
    expect(lintAuthEmailTemplate(withNew, colors, { allowNewEmail: true })).toEqual([]);
  });

  it("fails a link-expiry number in the copy and a body over the size ceiling", () => {
    expect(lint(good.replace("ignore este e-mail", "o link vale por 1 hora")).some((p) => p.includes("expiry"))).toBe(true);
    expect(lint(`${good}<!-- ${"x".repeat(7000)} -->`).some((p) => p.includes("ceiling"))).toBe(true);
  });
});
