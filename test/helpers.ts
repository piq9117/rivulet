import { expect } from "vitest";

import type { ParseResult, Parser } from "../src/index";

export function ok<T>(
  value: T,
  position: number,
): { ok: true; value: T; position: number } {
  return { ok: true, value, position };
}

export function err(
  message: string,
  position: number,
): { ok: false; message: string; position: number } {
  return { ok: false, message, position };
}

export function expectOk<T>(
  result: ParseResult<T>,
  value: T,
  position: number,
): asserts result is { ok: true; value: T; position: number } {
  expect(result).toEqual(ok(value, position));
}

export function expectErr(
  result: ParseResult<unknown>,
  message: string,
  position: number,
): void {
  expect(result).toEqual(err(message, position));
}

export function trackCalls<T>(parser: Parser<T>): {
  parser: Parser<T>;
  count: () => number;
} {
  let n = 0;
  return {
    parser: (input, position) => {
      n += 1;
      return parser(input, position);
    },
    count: () => n,
  };
}

export function equivalent<T>(
  left: Parser<T>,
  right: Parser<T>,
  input: string,
  position = 0,
): void {
  expect(left(input, position)).toEqual(right(input, position));
}
