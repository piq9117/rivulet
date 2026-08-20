type ParseSuccess<T> = {
  ok: true;
  value: T;
  position: number;
};

type ParseFailure = {
  ok: false;
  message: string;
  position: number;
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export type Parser<T> = (input: string, position: number) => ParseResult<T>;

export const runParser = <T>(
  parser: Parser<T>,
  source: string,
): ParseResult<T> => {
  return parser(source, 0);
};

export const succeed = <T>(value: T): Parser<T> => {
  return (_input, position) => ({
    ok: true,
    value,
    position,
  });
};

export const fail = <T>(message: string): Parser<T> => {
  return (_input, position) => ({
    ok: false,
    message,
    position,
  });
};

export const satisfy = (
  predicate: (char: string) => boolean,
  expected: string,
): Parser<string> => {
  return (input, position) => {
    if (position >= input.length) {
      return {
        ok: false,
        message: `expected ${expected}, reached end of input`,
        position,
      };
    }

    const ch = input[position]!;
    if (!predicate(ch)) {
      return {
        ok: false,
        message: `expected ${expected}, got ${JSON.stringify(ch)}`,
        position,
      };
    }

    return {
      ok: true,
      value: ch,
      position: position + 1,
    };
  };
};

export const char = (expected: string): Parser<string> => {
  return satisfy((ch) => ch === expected, JSON.stringify(expected));
};

export const map = <A, B>(parser: Parser<A>, f: (value: A) => B): Parser<B> => {
  return (input, position) => {
    const result = parser(input, position);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      value: f(result.value),
      position: result.position,
    };
  };
};

export const bind = <A, B>(
  parser: Parser<A>,
  f: (value: A) => Parser<B>,
): Parser<B> => {
  return (input, position) => {
    const result = parser(input, position);

    if (!result.ok) {
      return result;
    }

    return f(result.value)(input, result.position);
  };
};

export const skipThen = <A, B>(
  left: Parser<A>,
  right: Parser<B>,
): Parser<B> => {
  return bind(left, () => right);
};

export const between = <T>(
  open: Parser<unknown>,
  close: Parser<unknown>,
  body: Parser<T>,
): Parser<T> => {
  return bind(open, () =>
    bind(body, (value) => bind(close, () => succeed(value))),
  );
};

export const or = <T>(left: Parser<T>, right: Parser<T>): Parser<T> => {
  return (input, position) => {
    const leftResult = left(input, position);

    if (leftResult.ok) {
      return leftResult;
    }

    return right(input, position);
  };
};

export const choice = <T>(
  parsers: Parser<T>[],
  expected: string,
): Parser<T> => {
  return (input, position) => {
    if (parsers.length === 0) {
      return {
        ok: false,
        message: `choice: no alternatives while expecting ${expected}`,
        position,
      };
    }

    for (const parser of parsers) {
      const result = parser(input, position);
      // first success wins.
      if (result.ok) {
        return result;
      }
    }

    const got =
      position >= input.length
        ? "end of input"
        : JSON.stringify(input[position]);

    return {
      ok: false,
      message: `expected ${expected}, got ${got}`,
      position,
    };
  };
};

// zero or many
export const many = <T>(parser: Parser<T>): Parser<T[]> => {
  return (input, position) => {
    const values: T[] = [];
    let current = position;

    for (;;) {
      const result = parser(input, current);

      if (!result.ok) {
        return {
          ok: true,
          value: values,
          position: current,
        };
      }

      if (result.position === current) {
        return {
          ok: false,
          message: "many: inner parser succeeded without consuming input",
          position: current,
        };
      }
      values.push(result.value);
      current = result.position;
    }
  };
};

// one or many
export const many1 = <T>(parser: Parser<T>): Parser<T[]> => {
  return bind(parser, (first) => map(many(parser), (rest) => [first, ...rest]));
};

export const optional = <T>(parser: Parser<T>): Parser<T | undefined> => {
  return or(parser, succeed(undefined));
};

export const whitespaceChar: Parser<string> = satisfy((ch) => {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}, "whitespace");

export const whitespace: Parser<string[]> = many(whitespaceChar);

export const lexeme = <T>(parser: Parser<T>): Parser<T> => {
  return bind(parser, (value) => map(whitespace, () => value));
};

// chainl1 p op parses one or more occurrences of p, separated by op Returns a
// value obtained by a left associative application of all functions returned by
// op to the values returned by p.
export const chainl1 = <T>(
  term: Parser<T>,
  operator: Parser<(left: T, right: T) => T>,
) => {
  return bind(term, (first) => (input, position) => {
    let value = first;
    let current = position;

    for (;;) {
      const opResult = operator(input, current);

      if (!opResult.ok) {
        return {
          ok: true,
          value,
          position: current,
        };
      }
      const rightHandSide = term(input, opResult.position);

      if (!rightHandSide.ok) {
        return rightHandSide;
      }
      value = opResult.value(value, rightHandSide.value);
      current = rightHandSide.position;
    }
  });
};

export const lazy = <T>(factory: () => Parser<T>): Parser<T> => {
  let cached: Parser<T> | undefined;
  return (input, position) => {
    if (cached === undefined) {
      cached = factory();
    }
    return cached(input, position);
  };
};

export const eof: Parser<undefined> = (input, position) => {
  if (position < input.length) {
    return {
      ok: false,
      message: `expected end of input, got ${JSON.stringify(input[position])}`,
      position,
    };
  }
  return {
    ok: true,
    value: undefined,
    position,
  };
};

export const manyTill = <T,E>(parser: Parser<T>, end: Parser<E>): Parser<T[]> => {
  return (input, position) => {
    const values: T[] = [];
    let current = position;

    for(;;) {
      const endResult = end(input, current);
      
      if (endResult.ok) {
        return {
          ok: true,
          value: values,
          position: endResult.position
        }
      }

      const result = parser(input, current);
      if (!result.ok) {
        return result
      }

      if(result.position === current) {
        return {
          ok: false,
          message: "manyTill: inner parser succeeded without consuming iput",
          position: current
        }
      }
      values.push(result.value);
      current = result.position;
    }
  }
}
