import { describe, expect, it } from "vitest";

import {
  bind,
  char,
  eof,
  many,
  many1,
  manyTill,
  map,
  optional,
  or,
  runParser,
  satisfy,
  skipThen,
  succeed,
} from "../../src/index";
import { equivalent, expectErr, expectOk, trackCalls } from "../helpers";

describe("many", () => {
  const as = many(char("a"));

  it("succeeds with an empty array when the inner parser fails immediately", () => {
    expectOk(runParser(as, ""), [], 0);
    expectOk(runParser(as, "bbb"), [], 0);
  });

  it("collects zero or more matches and stops at the first failure", () => {
    expectOk(runParser(as, "aaab"), ["a", "a", "a"], 3);
    expectOk(runParser(as, "a"), ["a"], 1);
  });

  it("leaves the remaining input unconsumed", () => {
    const result = runParser(as, "aaX");
    expectOk(result, ["a", "a"], 2);
  });

  it("parses from a non-zero offset", () => {
    expect(as("xxaaa", 2)).toEqual({
      ok: true,
      value: ["a", "a", "a"],
      position: 5,
    });
  });

  it("fails when the inner parser succeeds without consuming input", () => {
    expectErr(
      runParser(many(succeed("x")), "abc"),
      "many: inner parser succeeded without consuming input",
      0,
    );
  });

  it("fails after some matches if a later iteration stops consuming", () => {
    const optionalA = optional(char("a"));
    const result = runParser(many(optionalA), "aa");
    expectErr(
      result,
      "many: inner parser succeeded without consuming input",
      2,
    );
  });
});

describe("many1", () => {
  const as = many1(char("a"));

  it("requires at least one match", () => {
    expectErr(runParser(as, ""), 'expected "a", reached end of input', 0);
    expectErr(runParser(as, "bbb"), 'expected "a", got "b"', 0);
  });

  it("collects one or more matches", () => {
    expectOk(runParser(as, "a"), ["a"], 1);
    expectOk(runParser(as, "aaab"), ["a", "a", "a"], 3);
  });

  it("is bind of one parse plus many", () => {
    const unfolded = bind(char("a"), (first) =>
      map(many(char("a")), (rest) => [first, ...rest]),
    );
    equivalent(as, unfolded, "aaab");
    equivalent(as, unfolded, "b");
    equivalent(as, unfolded, "");
  });
});

describe("optional", () => {
  const optA = optional(char("a"));

  it("wraps a success", () => {
    expectOk(runParser(optA, "abc"), "a", 1);
  });

  it("succeeds with undefined when the inner parser fails, without consuming", () => {
    expectOk(runParser(optA, "xyz"), undefined, 0);
    expectOk(runParser(optA, ""), undefined, 0);
  });

  it("always succeeds for a failing inner parser", () => {
    expectOk(runParser(optional(char("a")), "b"), undefined, 0);
  });

  it("is or(parser, succeed(undefined))", () => {
    equivalent(optA, or(char("a"), succeed(undefined)), "a");
    equivalent(optA, or(char("a"), succeed(undefined)), "b");
  });
});

describe("manyTill", () => {
  const asThenBang = manyTill(char("a"), char("!"));

  it("succeeds with an empty array when the end parser matches immediately", () => {
    expectOk(runParser(asThenBang, "!xyz"), [], 1);
    expectOk(runParser(manyTill(char("a"), eof), ""), [], 0);
  });

  it("collects zero or more matches and consumes the terminator", () => {
    expectOk(runParser(asThenBang, "!"), [], 1);
    expectOk(runParser(asThenBang, "a!"), ["a"], 2);
    expectOk(runParser(asThenBang, "aaa!b"), ["a", "a", "a"], 4);
  });

  it("leaves the remaining input after the terminator unconsumed", () => {
    const result = runParser(asThenBang, "aa!xyz");
    expectOk(result, ["a", "a"], 3);
  });

  it("parses from a non-zero offset", () => {
    expect(asThenBang("xxaa!", 2)).toEqual({
      ok: true,
      value: ["a", "a"],
      position: 5,
    });
  });

  it("tries the end parser before the item parser", () => {
    const item = trackCalls(char("a"));
    const parser = manyTill(item.parser, char("a"));
    expectOk(runParser(parser, "aaa"), [], 1);
    expect(item.count()).toBe(0);
  });

  it("discards the end parser's value", () => {
    const end = map(char("!"), () => "bang");
    expectOk(runParser(manyTill(char("a"), end), "aa!"), ["a", "a"], 3);
  });

  it("forwards the inner parser's failure when the end parser does not match", () => {
    expectErr(runParser(asThenBang, "aax"), 'expected "a", got "x"', 2);
    expectErr(
      runParser(asThenBang, "aa"),
      'expected "a", reached end of input',
      2,
    );
    expectErr(
      runParser(asThenBang, ""),
      'expected "a", reached end of input',
      0,
    );
    expectErr(runParser(asThenBang, "x"), 'expected "a", got "x"', 0);
  });

  it("fails when the inner parser succeeds without consuming input", () => {
    expectErr(
      runParser(manyTill(succeed("x"), char("!")), "abc"),
      "manyTill: inner parser succeeded without consuming input",
      0,
    );
  });

  it("fails after some matches if a later iteration stops consuming", () => {
    const optionalA = optional(char("a"));
    const result = runParser(manyTill(optionalA, char("!")), "aa");
    expectErr(
      result,
      "manyTill: inner parser succeeded without consuming input",
      2,
    );
  });

  it("accepts eof as the terminator, requiring the rest of the input to match", () => {
    const asThenEnd = manyTill(char("a"), eof);
    expectOk(runParser(asThenEnd, ""), [], 0);
    expectOk(runParser(asThenEnd, "aaa"), ["a", "a", "a"], 3);
    expectErr(runParser(asThenEnd, "aab"), 'expected "a", got "b"', 2);
  });

  it("can parse a run of characters up to a two-character terminator", () => {
    const anyChar = satisfy(() => true, "any");
    const comment = manyTill(anyChar, skipThen(char("*"), char("/")));

    expectOk(runParser(comment, "hello*/rest"), ["h", "e", "l", "l", "o"], 7);
    expectOk(runParser(comment, "hel*lo*/"), ["h", "e", "l", "*", "l", "o"], 8);
    expectOk(runParser(comment, "*/"), [], 2);
    expectErr(
      runParser(comment, "hello"),
      "expected any, reached end of input",
      5,
    );
  });
});
