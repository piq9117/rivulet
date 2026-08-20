import { describe, expect, it } from "vitest";

import {
  bind,
  char,
  many,
  many1,
  map,
  optional,
  or,
  runParser,
  succeed,
} from "../../src/index";
import { equivalent, expectErr, expectOk } from "../helpers";

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
