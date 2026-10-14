import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// GOALS.md §38g, "no new leak paths": the anamnese is health data. It is read by the aluno and their own personal and
// by nobody else, so it must never reach the ADM's screens, the aggregate summaries, a message to WhatsApp, or the
// device after it was sent. These are source-level guards (the way referenceLeak.test.ts guards the exercise
// reference): cheap, and they fail loudly the day someone wires it somewhere it should not go.

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

function filesUnder(dir: string): string[] {
  const root = join(SRC, dir);
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(path.slice(SRC.length).split("\\").join("/"));
    }
  };
  walk(root);
  return found;
}

const HEALTH = /anamnes|parq|par_q|PAR-Q/i;

describe("the anamnese stays out of the ADM and the aggregates", () => {
  const guarded = [
    ...filesUnder("app/admin"),
    "data/admin.ts",
    "data/adminCreate.ts",
    "data/adminCreateStudent.ts",
    "data/activity.ts",
    "data/platformInvites.ts",
    "domain/activity.ts",
    "domain/adminHome.ts",
    "domain/adminMetrics.ts",
  ];

  it("has files to guard (so the test cannot pass by finding nothing)", () => {
    expect(guarded.length).toBeGreaterThan(10);
    for (const path of guarded) expect(existsSync(join(SRC, path)), path).toBe(true);
  });

  it.each(guarded)("%s never mentions the anamnese, the PAR-Q+ or its answers", (path) => {
    expect(read(path)).not.toMatch(HEALTH);
  });
});

describe("what goes into a WhatsApp message", () => {
  const callers = [...filesUnder("app"), ...filesUnder("data"), ...filesUnder("domain")].filter((path) => /whatsappLink\(/.test(read(path)) && !path.endsWith("domain/contact.ts"));

  it("is only ever a first name and the address of a page", () => {
    expect(callers.length).toBeGreaterThan(0);
    for (const path of callers) {
      const source = read(path);
      for (const call of source.matchAll(/whatsappLink\(\s*([^,)]+),\s*`([^`]*)`/g)) {
        const interpolations = [...call[2].matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim());
        for (const expression of interpolations) {
          expect(expression, `${path}: ${call[0].slice(0, 80)}`).toMatch(/^(site|account\.name\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \?\? "")$/);
        }
        expect(call[2], path).not.toMatch(/PAR-Q|medic|cirurg|doen|dor |lesão|saúde|anamnese:/i);
      }
    }
  });
});

describe("the draft never outlives the send", () => {
  const form = read("app/aluno/avaliacao/AnamnesisForm.tsx");

  it("is removed from the device as soon as the anamnese is stored", () => {
    const stored = form.indexOf("await submitAssessment(");
    const removed = form.indexOf("removeDraft(browserStorage(), key)", stored);
    expect(stored).toBeGreaterThan(0);
    expect(removed).toBeGreaterThan(stored);
  });

  it("is never kept while the person has the 'continue?' question open, and the report keeps nothing at all", () => {
    expect(form).toMatch(/if \(saved !== null \|\| sent\) return;/);
    const report = read("app/_shared/AnamnesisReport.tsx");
    expect(report).not.toMatch(/localStorage|sessionStorage|browserStorage/);
  });
});
