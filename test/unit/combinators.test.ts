import { describe, expect, it } from "vitest";

import {
  between,
  bind,
  char,
  choice,
  fail,
  map,
  or,
  runParser,
  satisfy,
  skipThen,
  succeed,
} from "../../src/index";
import { equivalent, expectErr, expectOk, trackCalls } from "../helpers";

const digit = satisfy((ch) => ch >= "0" && ch <= "9", "digit");

describe("map", () => {
  it("transforms a successful value and keeps the position", () => {
    expectOk(
      runParser(
        map(char("a"), (ch) => ch.toUpperCase()),
        "abc",
      ),
      "A",
      1,
    );
  });

  it("can change the result type", () => {
    expectOk(
      runParser(
        map(digit, (ch) => Number(ch)),
        "7!",
      ),
      7,
      1,
    );
  });

  it("does not call the function when the inner parser fails", () => {
    let called = false;
    const parser = map(char("a"), (ch) => {
      called = true;
      return ch;
    });
    expectErr(runParser(parser, "b"), 'expected "a", got "b"', 0);
    expect(called).toBe(false);
  });

  it("forwards the inner failure unchanged", () => {
    const inner = fail<string>("nope");
    expect(
      runParser(
        map(inner, (x) => x),
        "z",
      ),
    ).toEqual(runParser(inner, "z"));
  });
});

describe("bind", () => {
  it("sequences parsers and threads the consumed position", () => {
    const twoAs = bind(char("a"), (first) =>
      map(char("a"), (second) => first + second),
    );
    expectOk(runParser(twoAs, "aab"), "aa", 2);
  });

  it("lets the second parser depend on the first value", () => {
    const twice = bind(digit, (d) => char(d));
    expectOk(runParser(twice, "77x"), "7", 2);
    expectErr(runParser(twice, "75"), 'expected "7", got "5"', 1);
  });

  it("does not call the function when the first parser fails", () => {
    let called = false;
    const parser = bind(char("a"), (ch) => {
      called = true;
      return succeed(ch);
    });
    expectErr(runParser(parser, "b"), 'expected "a", got "b"', 0);
    expect(called).toBe(false);
  });

  it("returns the second parser's failure", () => {
    const parser = bind(char("a"), () => fail("second"));
    expectErr(runParser(parser, "abc"), "second", 1);
  });
});

describe("skipThen", () => {
  it("keeps the right-hand value and discards the left", () => {
    expectOk(runParser(skipThen(char("("), char("a")), "(ab"), "a", 2);
  });

  it("fails with the left parser's error", () => {
    expectErr(
      runParser(skipThen(char("("), char("a")), "a)"),
      'expected "(", got "a"',
      0,
    );
  });

  it("fails with the right parser's error after consuming the left", () => {
    expectErr(
      runParser(skipThen(char("("), char("a")), "(b"),
      'expected "a", got "b"',
      1,
    );
  });

  it("is bind that ignores the left value", () => {
    equivalent(
      skipThen(char("a"), char("b")),
      bind(char("a"), () => char("b")),
      "ab",
    );
  });
});

describe("between", () => {
  const inParens = between(char("("), char(")"), digit);

  it("parses open, body, close and yields the body", () => {
    expectOk(runParser(inParens, "(7)x"), "7", 3);
  });

  it("fails if open fails", () => {
    expectErr(runParser(inParens, "[7]"), 'expected "(", got "["', 0);
  });

  it("fails if body fails after open", () => {
    expectErr(runParser(inParens, "(a)"), 'expected digit, got "a"', 1);
  });

  it("fails if close fails after a successful body, without backtracking", () => {
    expectErr(runParser(inParens, "(7]"), 'expected ")", got "]"', 2);
  });

  it("can nest", () => {
    const nested = between(char("("), char(")"), inParens);
    expectOk(runParser(nested, "((9))"), "9", 5);
  });
});

describe("or", () => {
  const aOrB = or(char("a"), char("b"));

  it("returns the left success without trying the right", () => {
    const right = trackCalls(char("b"));
    const parser = or(char("a"), right.parser);
    expectOk(runParser(parser, "ab"), "a", 1);
    expect(right.count()).toBe(0);
  });

  it("tries the right parser when the left fails", () => {
    expectOk(runParser(aOrB, "ba"), "b", 1);
  });

  it("always retries the right parser at the original position", () => {
    const consumeThenFail = bind(char("a"), () => fail<string>("nope"));
    const parser = or(consumeThenFail, char("a"));
    expectOk(runParser(parser, "a"), "a", 1);
  });

  it("returns the right failure when both fail", () => {
    expectErr(runParser(aOrB, "c"), 'expected "b", got "c"', 0);
  });

  it("does not consume input when both alternatives fail", () => {
    const result = runParser(aOrB, "zz");
    expectErr(result, 'expected "b", got "z"', 0);
  });
});

describe("choice", () => {
  const abc = choice([char("a"), char("b"), char("c")], "a, b, or c");

  it("returns the first successful alternative", () => {
    expectOk(runParser(abc, "a"), "a", 1);
    expectOk(runParser(abc, "b"), "b", 1);
    expectOk(runParser(abc, "c"), "c", 1);
  });

  it("does not try later alternatives after a success", () => {
    const later = trackCalls(map(char("a"), () => "later"));
    const parser = choice([char("a"), later.parser], "a");
    expectOk(runParser(parser, "a"), "a", 1);
    expect(later.count()).toBe(0);
  });

  it("prefers an earlier success even when a later parser would also match", () => {
    const parser = choice([char("a"), map(char("a"), () => "other")], "a");
    expectOk(runParser(parser, "a"), "a", 1);
  });

  it("fails with a combined message when every alternative fails", () => {
    expectErr(runParser(abc, "d"), 'expected a, b, or c, got "d"', 0);
  });

  it("reports end of input when every alternative fails at EOF", () => {
    expectErr(runParser(abc, ""), "expected a, b, or c, got end of input", 0);
  });

  it("fails immediately when there are no alternatives", () => {
    expectErr(
      runParser(choice([], "something"), "abc"),
      "choice: no alternatives while expecting something",
      0,
    );
    expect(choice([], "token")("abc", 2)).toEqual({
      ok: false,
      message: "choice: no alternatives while expecting token",
      position: 2,
    });
  });

  it("backtracks to the original position between alternatives", () => {
    const consumeThenFail = bind(char("a"), () => fail<string>("nope"));
    const parser = choice([consumeThenFail, char("a")], "a");
    expectOk(runParser(parser, "a"), "a", 1);
  });

  it("does not surface an inner failure that consumed input", () => {
    const parser = choice(
      [between(char("("), char(")"), char("x")), char("y")],
      "group or y",
    );
    expectErr(runParser(parser, "(x]"), 'expected group or y, got "("', 0);
  });
});
