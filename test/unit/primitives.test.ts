import { describe, expect, it } from "vitest";

import { char, fail, runParser, satisfy, succeed } from "../../src/index";
import { err, expectErr, expectOk, ok } from "../helpers";

describe("public API", () => {
  it("exports the combinator surface", async () => {
    const rivulet = await import("../../src/index");
    expect(Object.keys(rivulet).sort()).toEqual([
      "between",
      "bind",
      "chainl1",
      "char",
      "choice",
      "fail",
      "lazy",
      "lexeme",
      "many",
      "many1",
      "map",
      "optional",
      "or",
      "runParser",
      "satisfy",
      "skipThen",
      "succeed",
      "whitespace",
      "whitespaceChar",
    ]);
  });
});

describe("runParser", () => {
  it("starts at position 0", () => {
    expect(runParser(char("a"), "abc")).toEqual(char("a")("abc", 0));
  });

  it("does not require the parser to consume the whole input", () => {
    expectOk(runParser(char("a"), "abc"), "a", 1);
  });

  it("forwards failure from the parser", () => {
    expectErr(runParser(fail("nope"), "abc"), "nope", 0);
  });
});

describe("succeed", () => {
  it("succeeds without consuming input", () => {
    expectOk(runParser(succeed(42), "abc"), 42, 0);
  });

  it("preserves the incoming position", () => {
    expect(succeed("x")("abc", 2)).toEqual(ok("x", 2));
  });

  it("succeeds on empty input and past the end", () => {
    expectOk(runParser(succeed(null), ""), null, 0);
    expect(succeed(true)("", 4)).toEqual(ok(true, 4));
  });

  it("returns the value as-is", () => {
    const value = { n: 1 };
    const result = runParser(succeed(value), "");
    expectOk(result, value, 0);
    expect(result.value).toBe(value);
  });
});

describe("fail", () => {
  it("fails without consuming input", () => {
    expectErr(runParser(fail("boom"), "abc"), "boom", 0);
  });

  it("preserves the incoming position and message", () => {
    expect(fail("expected digit")("99", 1)).toEqual(err("expected digit", 1));
  });

  it("fails on empty input", () => {
    expectErr(runParser(fail("empty"), ""), "empty", 0);
  });
});

describe("satisfy", () => {
  const letterA = satisfy((ch) => ch === "a", "letter a");
  const digit = satisfy((ch) => ch >= "0" && ch <= "9", "digit");

  it("consumes a matching character", () => {
    expectOk(runParser(letterA, "abc"), "a", 1);
  });

  it("inspects only the character at the current position", () => {
    expect(letterA("xab", 1)).toEqual(ok("a", 2));
  });

  it("fails when the predicate rejects the character", () => {
    expectErr(runParser(letterA, "bac"), 'expected letter a, got "b"', 0);
  });

  it("fails at end of input", () => {
    expectErr(
      runParser(letterA, ""),
      "expected letter a, reached end of input",
      0,
    );
    expect(letterA("a", 1)).toEqual(
      err("expected letter a, reached end of input", 1),
    );
  });

  it("fails when the starting position is past the end", () => {
    expect(digit("hi", 5)).toEqual(
      err("expected digit, reached end of input", 5),
    );
  });

  it("JSON.stringifies the unexpected character in the error", () => {
    expectErr(runParser(digit, "\n"), 'expected digit, got "\\n"', 0);
    expectErr(runParser(digit, '"'), 'expected digit, got "\\""', 0);
  });

  it("does not call the predicate on empty input", () => {
    let called = false;
    const parser = satisfy(() => {
      called = true;
      return true;
    }, "any");
    expectErr(runParser(parser, ""), "expected any, reached end of input", 0);
    expect(called).toBe(false);
  });

  it("parses UTF-16 code units, not Unicode code points", () => {
    const anyChar = satisfy(() => true, "any");
    const grin = "😀";
    expect(grin.length).toBe(2);
    expectOk(runParser(anyChar, grin), grin[0], 1);
    expect(anyChar(grin, 1)).toEqual(ok(grin[1], 2));
  });
});

describe("char", () => {
  it("parses the expected character", () => {
    expectOk(runParser(char("a"), "abc"), "a", 1);
  });

  it.each([
    ["a", ok("a", 1)],
    ["abc", ok("a", 1)],
    ["", err('expected "a", reached end of input', 0)],
    ["b", err('expected "a", got "b"', 0)],
    ["A", err('expected "a", got "A"', 0)],
  ] as const)("char('a') on %j", (input, expected) => {
    expect(runParser(char("a"), input)).toEqual(expected);
  });

  it("uses JSON.stringify for the expected character in errors", () => {
    expectErr(runParser(char("\t"), "x"), 'expected "\\t", got "x"', 0);
    expectErr(runParser(char('"'), "x"), 'expected "\\"", got "x"', 0);
  });

  it("is case-sensitive and does not skip characters", () => {
    expectErr(runParser(char("a"), "ba"), 'expected "a", got "b"', 0);
  });

  it("never matches a multi-character string, because it reads one code unit", () => {
    expectErr(runParser(char("ab"), "ab"), 'expected "ab", got "a"', 0);
    expectErr(runParser(char("😀"), "😀"), 'expected "😀", got "\\ud83d"', 0);
  });

  it("parses from a non-zero offset", () => {
    expect(char("b")("abc", 1)).toEqual(ok("b", 2));
  });
});
