import { describe, expect, it } from "vitest";

import {
  char,
  lexeme,
  many,
  runParser,
  whitespace,
  whitespaceChar,
} from "../../src/index";
import { equivalent, expectErr, expectOk } from "../helpers";

describe("whitespaceChar", () => {
  it.each([" ", "\t", "\n", "\r"] as const)("accepts %j", (ch) => {
    expectOk(runParser(whitespaceChar, ch), ch, 1);
  });

  it.each(["a", ".", "\v", "\f", "\u00A0", "\u2028"] as const)(
    "rejects %j",
    (ch) => {
      const result = runParser(whitespaceChar, ch);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(/^expected whitespace, got /);
        expect(result.position).toBe(0);
      }
    },
  );

  it("fails at end of input", () => {
    expectErr(
      runParser(whitespaceChar, ""),
      "expected whitespace, reached end of input",
      0,
    );
  });
});

describe("whitespace", () => {
  it("is many(whitespaceChar)", () => {
    equivalent(whitespace, many(whitespaceChar), " \t\n\rX");
    equivalent(whitespace, many(whitespaceChar), "abc");
    equivalent(whitespace, many(whitespaceChar), "");
  });

  it("consumes a run of spaces, tabs, and newlines", () => {
    expectOk(runParser(whitespace, " \t\n\rX"), [" ", "\t", "\n", "\r"], 4);
  });

  it("succeeds with an empty array when no whitespace is present", () => {
    expectOk(runParser(whitespace, "abc"), [], 0);
    expectOk(runParser(whitespace, ""), [], 0);
  });
});

describe("lexeme", () => {
  const tokenA = lexeme(char("a"));

  it("parses the token and then skips trailing whitespace", () => {
    expectOk(runParser(tokenA, "a   b"), "a", 4);
    expectOk(runParser(tokenA, "a\n\t"), "a", 3);
  });

  it("does not require trailing whitespace", () => {
    expectOk(runParser(tokenA, "ab"), "a", 1);
    expectOk(runParser(tokenA, "a"), "a", 1);
  });

  it("does not skip leading whitespace", () => {
    expectErr(runParser(tokenA, " a"), 'expected "a", got " "', 0);
  });

  it("forwards failure of the inner parser", () => {
    expectErr(runParser(tokenA, "b"), 'expected "a", got "b"', 0);
  });
});
