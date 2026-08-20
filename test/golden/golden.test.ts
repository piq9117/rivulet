import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { type ParseResult, runParser } from "../../src/index";
import { type GoldenParserName, goldenParsers } from "./parsers";

type Fixture = {
  description: string;
  parser: GoldenParserName;
  input: string;
  expected: ParseResult<unknown>;
};

const updateGoldens = process.env.GOLDEN_UPDATE === "1";
const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadSuite(
  suite: string,
): Array<{ file: string; fixture: Fixture; path: string }> {
  const dir = join(fixturesRoot, suite);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((file) => {
      const path = join(dir, file);
      const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
      if (!(fixture.parser in goldenParsers)) {
        throw new Error(`${file}: unknown parser ${String(fixture.parser)}`);
      }
      return { file, fixture, path };
    });
}

function runFixture(file: string, fixture: Fixture, path: string): void {
  const parser = goldenParsers[fixture.parser];
  const actual = runParser(parser, fixture.input);

  if (updateGoldens) {
    const next = { ...fixture, expected: actual };
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
    return;
  }

  expect(actual, file).toEqual(fixture.expected);
}

describe("golden: arithmetic", () => {
  for (const { file, fixture, path } of loadSuite("arithmetic")) {
    it(`${file} — ${fixture.description}`, () => {
      runFixture(file, fixture, path);
    });
  }
});

describe("golden: json", () => {
  for (const { file, fixture, path } of loadSuite("json")) {
    it(`${file} — ${fixture.description}`, () => {
      runFixture(file, fixture, path);
    });
  }
});
