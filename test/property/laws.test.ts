import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  between,
  bind,
  char,
  choice,
  eof,
  fail,
  lazy,
  lexeme,
  many,
  many1,
  manyTill,
  map,
  optional,
  or,
  type Parser,
  runParser,
  satisfy,
  skipThen,
  succeed,
  whitespace,
  whitespaceChar,
} from "../../src/index";
import { equivalent } from "../helpers";

const asciiUnit = fc.string({
  unit: "grapheme-ascii",
  minLength: 1,
  maxLength: 1,
});

const inputArb = fc.string({ unit: "grapheme-ascii", maxLength: 24 });

const inputAndPos = inputArb.chain((input) =>
  fc.record({
    input: fc.constant(input),
    pos: fc.integer({ min: 0, max: input.length }),
  }),
);

const codeUnit = fc
  .integer({ min: 0, max: 0xffff })
  .map((n) => String.fromCharCode(n));

const binaryInput = fc.string({ unit: codeUnit, maxLength: 24 });

function check(
  property: fc.IProperty<unknown[]>,
  params?: fc.Parameters<unknown>,
): void {
  fc.assert(property, { numRuns: 100, ...params });
}

describe("primitive laws", () => {
  it("succeed never fails and never consumes", () => {
    check(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        inputAndPos,
        (value, { input, pos }) => {
          const result = succeed(value)(input, pos);
          expect(result).toEqual({ ok: true, value, position: pos });
        },
      ),
    );
  });

  it("fail never succeeds and never consumes", () => {
    check(
      fc.property(fc.string(), inputAndPos, (message, { input, pos }) => {
        const result = fail(message)(input, pos);
        expect(result).toEqual({ ok: false, message, position: pos });
      }),
    );
  });

  it("runParser is parser(source, 0)", () => {
    check(
      fc.property(asciiUnit, inputArb, (expected, input) => {
        const parser = char(expected);
        expect(runParser(parser, input)).toEqual(parser(input, 0));
      }),
    );
  });

  it("eof succeeds without consuming exactly when position is at or past the end", () => {
    check(
      fc.property(
        binaryInput,
        fc.integer({ min: 0, max: 40 }),
        (input, pos) => {
          const result = eof(input, pos);
          if (pos >= input.length) {
            expect(result).toEqual({
              ok: true,
              value: undefined,
              position: pos,
            });
          } else {
            expect(result).toEqual({
              ok: false,
              message: `expected end of input, got ${JSON.stringify(input[pos])}`,
              position: pos,
            });
          }
        },
      ),
    );
  });
});

describe("satisfy and char", () => {
  it("satisfy consumes exactly one matching code unit or fails in place", () => {
    check(
      fc.property(
        binaryInput,
        fc.integer({ min: 0, max: 40 }),
        (input, rawPos) => {
          const pos = Math.min(rawPos, input.length);
          const predicate = (ch: string) => ch.charCodeAt(0) % 2 === 0;
          const result = satisfy(predicate, "even")(input, pos);

          if (pos >= input.length) {
            expect(result).toEqual({
              ok: false,
              message: "expected even, reached end of input",
              position: pos,
            });
            return;
          }

          const ch = input.charAt(pos);
          if (predicate(ch)) {
            expect(result).toEqual({ ok: true, value: ch, position: pos + 1 });
          } else {
            expect(result).toEqual({
              ok: false,
              message: `expected even, got ${JSON.stringify(ch)}`,
              position: pos,
            });
          }
        },
      ),
    );
  });

  it("char(c) succeeds iff the current code unit equals c", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        const result = char(expected)(input, pos);
        const at = pos < input.length ? input[pos] : undefined;

        if (at === expected) {
          expect(result).toEqual({
            ok: true,
            value: expected,
            position: pos + 1,
          });
        } else if (pos >= input.length) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.message).toBe(
              `expected ${JSON.stringify(expected)}, reached end of input`,
            );
            expect(result.position).toBe(pos);
          }
        } else {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.message).toBe(
              `expected ${JSON.stringify(expected)}, got ${JSON.stringify(at)}`,
            );
            expect(result.position).toBe(pos);
          }
        }
      }),
    );
  });

  it("char of a multi-code-unit string never succeeds", () => {
    const multi = fc
      .tuple(asciiUnit, asciiUnit)
      .map(([a, b]) => a + b)
      .filter((s) => s.length !== 1);

    check(
      fc.property(multi, inputArb, (expected, input) => {
        const result = runParser(char(expected), input);
        expect(result.ok).toBe(false);
      }),
    );
  });
});

describe("functor and monad laws", () => {
  it("map identity: map(p, x => x) ≡ p", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        equivalent(
          map(char(expected), (x) => x),
          char(expected),
          input,
          pos,
        );
      }),
    );
  });

  it("map composition: map(map(p, f), g) ≡ map(p, x => g(f(x)))", () => {
    const f = (x: string) => x + x;
    const g = (x: string) => x.length;
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        const p = char(expected);
        equivalent(
          map(map(p, f), g),
          map(p, (x) => g(f(x))),
          input,
          pos,
        );
      }),
    );
  });

  it("map preserves failure exactly", () => {
    check(
      fc.property(inputArb, (input) => {
        const inner = fail<string>("nope");
        expect(map(inner, (x) => x.length)(input, 0)).toEqual(inner(input, 0));
      }),
    );
  });

  it("bind left identity: bind(succeed(x), f) ≡ f(x)", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (x, { input, pos }) => {
        const f = (value: string): Parser<string> =>
          map(succeed(value), (v) => v.toUpperCase());
        equivalent(bind(succeed(x), f), f(x), input, pos);
      }),
    );
  });

  it("bind right identity: bind(p, succeed) ≡ p", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        equivalent(bind(char(expected), succeed), char(expected), input, pos);
      }),
    );
  });

  it("bind skips the continuation when the first parser fails", () => {
    check(
      fc.property(inputArb, (input) => {
        let called = false;
        const parser = bind(fail<string>("nope"), () => {
          called = true;
          return succeed("x");
        });
        expect(parser(input, 0)).toEqual({
          ok: false,
          message: "nope",
          position: 0,
        });
        expect(called).toBe(false);
      }),
    );
  });
});

describe("choice laws", () => {
  it("or is left-biased: a success on the left is the result", () => {
    check(
      fc.property(asciiUnit, asciiUnit, inputArb, (a, b, input) => {
        const left = char(a);
        const right = char(b);
        const leftResult = left(input, 0);
        if (leftResult.ok) {
          expect(or(left, right)(input, 0)).toEqual(leftResult);
        }
      }),
    );
  });

  it("or(fail(m), p) ≡ p", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        equivalent(
          or(fail(`no ${expected}`), char(expected)),
          char(expected),
          input,
          pos,
        );
      }),
    );
  });

  it("or backtracks to the original position", () => {
    check(
      fc.property(inputAndPos, ({ input, pos }) => {
        const consumeThenFail = bind(
          satisfy(() => true, "any"),
          () => fail<string>("nope"),
        );
        const result = or(consumeThenFail, succeed("backtrack"))(input, pos);
        expect(result).toEqual({ ok: true, value: "backtrack", position: pos });
      }),
    );
  });

  it("choice of a single parser succeeds exactly when that parser does", () => {
    check(
      fc.property(asciiUnit, inputArb, (expected, input) => {
        const p = char(expected);
        const chosen = choice([p], "one");
        const direct = runParser(p, input);
        const viaChoice = runParser(chosen, input);
        if (direct.ok) {
          expect(viaChoice).toEqual(direct);
        } else {
          expect(viaChoice.ok).toBe(false);
        }
      }),
    );
  });

  it("choice([]) always fails at the starting position", () => {
    check(
      fc.property(inputAndPos, ({ input, pos }) => {
        const result = choice([], "token")(input, pos);
        expect(result).toEqual({
          ok: false,
          message: "choice: no alternatives while expecting token",
          position: pos,
        });
      }),
    );
  });
});

describe("repetition laws", () => {
  it("optional always succeeds", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        const result = optional(char(expected))(input, pos);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        if (pos < input.length && input[pos] === expected) {
          expect(result.value).toBe(expected);
          expect(result.position).toBe(pos + 1);
        } else {
          expect(result.value).toBeUndefined();
          expect(result.position).toBe(pos);
        }
      }),
    );
  });

  it("many(char(c)) consumes the longest prefix of c", () => {
    check(
      fc.property(asciiUnit, inputArb, (c, rest) => {
        fc.pre(!rest.startsWith(c));
        const n = rest.length % 8;
        const input = c.repeat(n) + rest;
        const result = runParser(many(char(c)), input);
        expect(result).toEqual({
          ok: true,
          value: Array.from({ length: n }, () => c),
          position: n * c.length,
        });
      }),
    );
  });

  it("many1(p) fails exactly when many(p) yields [] for a consuming char parser", () => {
    check(
      fc.property(asciiUnit, inputArb, (c, input) => {
        const manyResult = runParser(many(char(c)), input);
        const many1Result = runParser(many1(char(c)), input);
        expect(manyResult.ok).toBe(true);
        if (!manyResult.ok) {
          return;
        }
        if (manyResult.value.length === 0) {
          expect(many1Result.ok).toBe(false);
        } else {
          expect(many1Result).toEqual(manyResult);
        }
      }),
    );
  });

  it("many of a non-consuming success always fails", () => {
    check(
      fc.property(inputAndPos, ({ input, pos }) => {
        const result = many(succeed("x"))(input, pos);
        expect(result).toEqual({
          ok: false,
          message: "many: inner parser succeeded without consuming input",
          position: pos,
        });
      }),
    );
  });

  it("manyTill(char(c), char(end)) consumes a prefix of c then the terminator", () => {
    check(
      fc.property(asciiUnit, asciiUnit, inputArb, (c, end, rest) => {
        fc.pre(c !== end);
        const n = rest.length % 8;
        const input = c.repeat(n) + end + rest;
        const result = runParser(manyTill(char(c), char(end)), input);
        expect(result).toEqual({
          ok: true,
          value: Array.from({ length: n }, () => c),
          position: n * c.length + end.length,
        });
      }),
    );
  });

  it("manyTill prefers the end parser when it also matches the item", () => {
    check(
      fc.property(asciiUnit, inputArb, (c, rest) => {
        const input = c + rest;
        const result = runParser(manyTill(char(c), char(c)), input);
        expect(result).toEqual({
          ok: true,
          value: [],
          position: c.length,
        });
      }),
    );
  });

  it("manyTill(p, eof) succeeds iff the remaining input is a run of p", () => {
    check(
      fc.property(asciiUnit, inputArb, (c, input) => {
        const result = runParser(manyTill(char(c), eof), input);
        const allMatch = [...input].every((ch) => ch === c);
        if (allMatch) {
          expect(result).toEqual({
            ok: true,
            value: Array.from({ length: input.length }, () => c),
            position: input.length,
          });
        } else {
          expect(result.ok).toBe(false);
        }
      }),
    );
  });

  it("manyTill of a non-consuming success fails when end does not match", () => {
    check(
      fc.property(inputAndPos, ({ input, pos }) => {
        const result = manyTill(succeed("x"), fail("no end"))(input, pos);
        expect(result).toEqual({
          ok: false,
          message: "manyTill: inner parser succeeded without consuming input",
          position: pos,
        });
      }),
    );
  });

  it("manyTill(p, succeed) always succeeds with [] without consuming", () => {
    check(
      fc.property(inputAndPos, ({ input, pos }) => {
        const result = manyTill(char("a"), succeed("end"))(input, pos);
        expect(result).toEqual({ ok: true, value: [], position: pos });
      }),
    );
  });
});

describe("lexeme and whitespace", () => {
  it("whitespace only consumes space, tab, newline, and carriage return", () => {
    check(
      fc.property(inputArb, (input) => {
        const result = runParser(whitespace, input);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        expect(result.value.join("")).toBe(input.slice(0, result.position));
        for (const ch of result.value) {
          expect([" ", "\t", "\n", "\r"]).toContain(ch);
        }
        if (result.position < input.length) {
          expect([" ", "\t", "\n", "\r"]).not.toContain(input[result.position]);
        }
      }),
    );
  });

  it("lexeme(p) is p followed by whitespace, and does not skip leading whitespace", () => {
    check(
      fc.property(asciiUnit, inputArb, (c, input) => {
        const result = runParser(lexeme(char(c)), input);
        const inner = runParser(char(c), input);
        if (!inner.ok) {
          expect(result).toEqual(inner);
          return;
        }
        const ws = whitespace(input, inner.position);
        expect(ws.ok).toBe(true);
        if (ws.ok) {
          expect(result).toEqual({
            ok: true,
            value: inner.value,
            position: ws.position,
          });
        }
      }),
    );
  });

  it("whitespaceChar matches the four characters the implementation documents", () => {
    check(
      fc.property(
        fc.string({ unit: "binary-ascii", minLength: 1, maxLength: 1 }),
        (ch) => {
          const result = runParser(whitespaceChar, ch);
          const accepted =
            ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
          expect(result.ok).toBe(accepted);
        },
      ),
    );
  });
});

describe("between, skipThen, lazy", () => {
  it("skipThen(succeed(x), p) ≡ p", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        equivalent(
          skipThen(succeed("ignored"), char(expected)),
          char(expected),
          input,
          pos,
        );
      }),
    );
  });

  it("skipThen(fail(m), p) ≡ fail(m)", () => {
    check(
      fc.property(asciiUnit, inputArb, (expected, input) => {
        equivalent(skipThen(fail("nope"), char(expected)), fail("nope"), input);
      }),
    );
  });

  it("between(succeed, succeed, p) ≡ p when open and close consume nothing", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        equivalent(
          between(succeed(null), succeed(null), char(expected)),
          char(expected),
          input,
          pos,
        );
      }),
    );
  });

  it("lazy(() => p) ≡ p", () => {
    check(
      fc.property(asciiUnit, inputAndPos, (expected, { input, pos }) => {
        equivalent(
          lazy(() => char(expected)),
          char(expected),
          input,
          pos,
        );
      }),
    );
  });
});
