import { describe, expect, it } from "vitest";
import { settingsTabs } from "./settingsTabs";

describe("settingsTabs", () => {
  it.each(["/app/conta", "/aluno/conta", "/admin/conta"])("%s: the account tab is current, the install tab is one step below", (root) => {
    for (const path of [root, `${root}/`]) {
      expect(settingsTabs(path)).toEqual([
        { href: root, label: "Minha conta", current: true },
        { href: `${root}/instalar`, label: "Instalar no celular", current: false },
      ]);
    }
  });

  it.each(["/app/conta", "/aluno/conta", "/admin/conta"])("%s/instalar: the install tab is current and both links keep the same root", (root) => {
    for (const path of [`${root}/instalar`, `${root}/instalar/`]) {
      expect(settingsTabs(path)).toEqual([
        { href: root, label: "Minha conta", current: false },
        { href: `${root}/instalar`, label: "Instalar no celular", current: true },
      ]);
    }
  });
});
