import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourcePath = new URL("../../app/src/main/assets/hypertrophy_volume_reference.md", import.meta.url);
const outputPath = new URL("../public/prompt/exercise-catalog.json", import.meta.url);
const ALLOWED_COEFFICIENTS = new Set([0, 0.25, 0.5, 0.75, 1]);
const MONO_HEADERS = [1, 0.75, 0.5, 0.25];

function fail(line, message) {
  throw new Error(`Linha ${line}: ${message}`);
}

function cellsOf(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function coefficientOf(text, line) {
  const raw = text.trim();
  if (!/^(?:0|0[,.](?:25|5|75)|1(?:[,.]0)?)$/.test(raw)) fail(line, `coeficiente inválido “${text}”`);
  const normalized = raw.replace(",", ".");
  const coefficient = Number(normalized);
  if (!Number.isFinite(coefficient) || !ALLOWED_COEFFICIENTS.has(coefficient)) {
    fail(line, `coeficiente inválido “${text}”`);
  }
  return coefficient;
}

function isDivider(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableKind(headers, line) {
  if (headers.length < 2) fail(line, "cabeçalho da tabela precisa ter colunas de músculo");
  const levels = headers.slice(1).map((header) => {
    const text = header.replace(",", ".");
    const value = Number(text);
    return Number.isFinite(value) && ALLOWED_COEFFICIENTS.has(value) ? value : null;
  });
  if (levels.length === MONO_HEADERS.length && levels.every((value, index) => value === MONO_HEADERS[index])) {
    return { type: "mono", headers };
  }
  if (headers.slice(1).some((header) => header === "")) fail(line, "cabeçalho de músculo vazio");
  if (new Set(headers.slice(1)).size !== headers.length - 1) fail(line, "há músculos duplicados no cabeçalho");
  return { type: "wide", headers };
}

function addMuscle(muscles, name, coefficient, line) {
  const label = name.trim();
  if (!label) fail(line, "nome de músculo vazio");
  if (Object.hasOwn(muscles, label) && muscles[label] !== coefficient) {
    fail(line, `“${label}” aparece com coeficientes diferentes`);
  }
  muscles[label] = coefficient;
}

function parseExerciseRow(cells, schema, group, line) {
  if (cells.length !== schema.headers.length) {
    fail(line, `esperava ${schema.headers.length} colunas, encontrei ${cells.length}`);
  }
  const name = cells[0].trim();
  if (!name) fail(line, "nome do exercício vazio");
  if (!group) fail(line, "exercício sem grupo (cabeçalho ## esperado)");

  const muscles = {};
  if (schema.type === "wide") {
    for (let index = 1; index < cells.length; index += 1) {
      muscles[schema.headers[index]] = coefficientOf(cells[index], line);
    }
  } else {
    for (let index = 1; index < cells.length; index += 1) {
      const cell = cells[index].trim();
      if (cell === "-") continue;
      if (!cell) fail(line, "lista de músculos vazia; use ‘-’ para célula sem músculo");
      const coefficient = MONO_HEADERS[index - 1];
      for (const muscle of cell.split(";")) addMuscle(muscles, muscle, coefficient, line);
    }
  }
  if (Object.keys(muscles).length === 0) fail(line, "o exercício não tem coeficientes de músculos");
  return { name, group, muscles };
}

export function parseExerciseCatalog(markdown) {
  const exercises = [];
  const seenNames = new Set();
  let group = "";
  let schema = null;
  let tableRows = 0;
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^#{2,6}\s+(.+?)\s*$/.exec(line);
    if (heading) {
      group = heading[1].trim();
      schema = null;
      continue;
    }
    if (!/^\s*\|.*\|\s*$/.test(line)) {
      schema = null;
      continue;
    }

    const cells = cellsOf(line);
    if (cells[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "exercicio") {
      schema = tableKind(cells, index + 1);
      continue;
    }
    if (schema === null || isDivider(cells)) continue;

    const exercise = parseExerciseRow(cells, schema, group, index + 1);
    if (seenNames.has(exercise.name)) fail(index + 1, `exercício duplicado “${exercise.name}”`);
    seenNames.add(exercise.name);
    exercises.push(exercise);
    tableRows += 1;
  }

  if (tableRows === 0) throw new Error("Nenhuma tabela de exercícios reconhecida.");
  return { version: createHash("sha256").update(markdown).digest("hex").slice(0, 16), exercises };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const markdown = readFileSync(sourcePath, "utf8");
    const catalog = parseExerciseCatalog(markdown);
    const json = `${JSON.stringify(catalog, null, 2)}\n`;
    if (process.argv.includes("--stdout")) {
      process.stdout.write(json);
    } else {
      mkdirSync(new URL("../public/prompt/", import.meta.url), { recursive: true });
      writeFileSync(outputPath, json, "utf8");
      process.stdout.write(`Catálogo gerado: ${catalog.exercises.length} exercícios.\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
