import { describe, expect, it } from "vitest";

import { char, type ParseResult, runParser, satisfy } from "../src/index";

describe("combinators", () => {
  const resultHandler = <T>(
    result: ParseResult<T>,
    successHandler: (value: T) => void,
  ) => {
    if (!result.ok) {
      throw new Error(result.message);
    }
    successHandler(result.value);
  };

  it("satisfy", () => {
    const parser = satisfy((ch) => ch === "c", "c");
    const result = runParser(parser, "c");
    resultHandler(result, (value) => expect(value).toBe("c"));

    const error = runParser(parser, "b");
    try {
      resultHandler(error, () => void 0);
    } catch (e) {
      if (e instanceof Error) {
        expect(e.message).toBe('expected c, got "b"');
      }
    }
  });

  it("char", () => {
    const parser = char("a");

    const result = runParser(parser, "a");
    resultHandler(result, (value) => expect(value).toBe("a"));

    const error = runParser(parser, "b");
    try {
      resultHandler(error, () => void 0);
    } catch (e) {
      if (e instanceof Error) {
        expect(e.message).toBe('expected a, got "b"');
      }
    }
  });
});
