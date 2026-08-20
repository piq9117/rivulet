import { describe, expect, it } from "vitest";

import {
  between,
  chainl1,
  char,
  lazy,
  map,
  or,
  type Parser,
  runParser,
  satisfy,
} from "../../src/index";
import { expectErr, expectOk, trackCalls } from "../helpers";

const digit = satisfy((ch) => ch >= "0" && ch <= "9", "digit");
const num = map(digit, (d) => Number(d));

describe("chainl1", () => {
  const plus = map(
    char("+"),
    () => (left: number, right: number) => left + right,
  );
  const minus = map(
    char("-"),
    () => (left: number, right: number) => left - right,
  );
  const add = chainl1(num, plus);
  const sub = chainl1(num, minus);

  it("parses a single term", () => {
    expectOk(runParser(add, "7xyz"), 7, 1);
  });

  it("applies a binary operator", () => {
    expectOk(runParser(add, "1+2"), 3, 3);
  });

  it("is left-associative", () => {
    expectOk(runParser(sub, "9-2-3"), 4, 5);
    expectOk(runParser(add, "1+2+3+4"), 10, 7);
  });

  it("stops when the operator does not match", () => {
    expectOk(runParser(add, "1*2"), 1, 1);
  });

  it("fails if the operator matches but the next term does not", () => {
    expectErr(runParser(add, "1+"), "expected digit, reached end of input", 2);
    expectErr(runParser(add, "1+x"), 'expected digit, got "x"', 2);
  });

  it("fails when the first term fails", () => {
    expectErr(runParser(add, "+1"), 'expected digit, got "+"', 0);
    expectErr(runParser(add, ""), "expected digit, reached end of input", 0);
  });
});

describe("lazy", () => {
  it("delays construction so recursive parsers can close over themselves", () => {
    const parens: Parser<string> = lazy(() =>
      or(
        char("x"),
        map(between(char("("), char(")"), parens), (inner) => `(${inner})`),
      ),
    );

    expectOk(runParser(parens, "x"), "x", 1);
    expectOk(runParser(parens, "(x)"), "(x)", 3);
    expectOk(runParser(parens, "(((x)))"), "(((x)))", 7);
  });

  it("caches the factory result after the first call", () => {
    let builds = 0;
    const parser = lazy(() => {
      builds += 1;
      return char("a");
    });

    expectOk(runParser(parser, "a"), "a", 1);
    expectOk(runParser(parser, "a"), "a", 1);
    parser("b", 0);
    expect(builds).toBe(1);
  });

  it("does not call the factory until the parser runs", () => {
    const inner = trackCalls(char("a"));
    let builds = 0;
    const parser = lazy(() => {
      builds += 1;
      return inner.parser;
    });

    expect(builds).toBe(0);
    expect(inner.count()).toBe(0);
    expectOk(runParser(parser, "a"), "a", 1);
    expect(builds).toBe(1);
    expect(inner.count()).toBe(1);
  });

  it("is equivalent to the parser returned by the factory", () => {
    const parser = lazy(() => char("a"));
    expect(runParser(parser, "ab")).toEqual(runParser(char("a"), "ab"));
    expect(runParser(parser, "b")).toEqual(runParser(char("a"), "b"));
  });
});
