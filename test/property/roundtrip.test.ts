import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { runParser } from "../../src/index";
import {
  type Expr,
  evalExpr,
  expr,
  type Json,
  json,
  printExpr,
} from "../golden/parsers";

const exprArb: fc.Arbitrary<Expr> = fc.letrec<{ expr: Expr }>((tie) => ({
  expr: fc.oneof(
    { depthSize: "small" },
    fc.integer({ min: 0, max: 99 }).map((value) => ({
      type: "num" as const,
      value,
    })),
    fc
      .tuple(
        fc.constantFrom("+", "-", "*", "/") as fc.Arbitrary<
          "+" | "-" | "*" | "/"
        >,
        tie("expr"),
        tie("expr"),
      )
      .map(([op, left, right]) => ({
        type: "bin" as const,
        op,
        left: left as Expr,
        right: right as Expr,
      })),
  ),
})).expr;

const jsonArb: fc.Arbitrary<Json> = fc.letrec<{
  json: Json;
  arr: Json[];
  obj: { [key: string]: Json };
}>((tie) => ({
  json: fc.oneof(
    { depthSize: "small" },
    fc.constant(null),
    fc.boolean(),
    fc.integer({ min: -999, max: 999 }),
    fc.stringMatching(/^[a-zA-Z0-9 ]{0,8}$/),
    tie("arr"),
    tie("obj"),
  ),
  arr: fc.array(tie("json"), { maxLength: 4 }),
  obj: fc.dictionary(
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,4}$/),
    tie("json"),
    { maxKeys: 3, noNullPrototype: true },
  ),
})).json;

describe("arithmetic expression properties", () => {
  it("round-trips fully parenthesized expression trees", () => {
    fc.assert(
      fc.property(exprArb, (tree) => {
        const input = printExpr(tree);
        const result = runParser(expr, input);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        expect(result.value).toEqual(tree);
        expect(result.position).toBe(input.length);
      }),
      { numRuns: 80 },
    );
  });

  it("evaluates a sum of digits to the numeric sum", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (nums) => {
          const input = nums.join("+");
          const result = runParser(expr, input);
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          expect(evalExpr(result.value)).toBe(nums.reduce((a, b) => a + b, 0));
          expect(result.position).toBe(input.length);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("evaluates a product of non-zero digits to the numeric product", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 9 }), {
          minLength: 1,
          maxLength: 6,
        }),
        (nums) => {
          const input = nums.join("*");
          const result = runParser(expr, input);
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          expect(evalExpr(result.value)).toBe(nums.reduce((a, b) => a * b, 1));
          expect(result.position).toBe(input.length);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("gives * and / higher precedence than + and -", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        (a, b, c) => {
          const input = `${a}+${b}*${c}`;
          const result = runParser(expr, input);
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          expect(evalExpr(result.value)).toBe(a + b * c);
          expect(result.value).toEqual({
            type: "bin",
            op: "+",
            left: { type: "num", value: a },
            right: {
              type: "bin",
              op: "*",
              left: { type: "num", value: b },
              right: { type: "num", value: c },
            },
          });
        },
      ),
      { numRuns: 40 },
    );
  });

  it("subtraction is left-associative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (a, b, c) => {
          const input = `${a}-${b}-${c}`;
          const result = runParser(expr, input);
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          expect(evalExpr(result.value)).toBe(a - b - c);
          expect(result.value).toEqual({
            type: "bin",
            op: "-",
            left: {
              type: "bin",
              op: "-",
              left: { type: "num", value: a },
              right: { type: "num", value: b },
            },
            right: { type: "num", value: c },
          });
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("json properties", () => {
  it("round-trips JSON.stringify output for a restricted JSON subset", () => {
    fc.assert(
      fc.property(jsonArb, (value) => {
        const input = JSON.stringify(value);
        const result = runParser(json, input);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        expect(result.value).toEqual(value);
        expect(result.position).toBe(input.length);
      }),
      { numRuns: 80 },
    );
  });

  it("accepts leading whitespace before a JSON value", () => {
    fc.assert(
      fc.property(
        jsonArb,
        fc.stringMatching(/^[ \t\n\r]{0,5}$/),
        (value, pad) => {
          const input = pad + JSON.stringify(value);
          const result = runParser(json, input);
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          expect(result.value).toEqual(value);
          expect(result.position).toBe(input.length);
        },
      ),
      { numRuns: 40 },
    );
  });
});
