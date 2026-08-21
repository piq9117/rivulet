import {
  between,
  bind,
  chainl1,
  char,
  choice,
  lazy,
  lexeme,
  many,
  many1,
  map,
  optional,
  or,
  type Parser,
  satisfy,
  sepBy,
  skipThen,
  succeed,
  whitespace,
} from "../../src/index";

export type BinOp = "+" | "-" | "*" | "/";

export type Expr =
  | { type: "num"; value: number }
  | { type: "bin"; op: BinOp; left: Expr; right: Expr };

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

const digit = satisfy((ch) => ch >= "0" && ch <= "9", "digit");

function literal(s: string): Parser<string> {
  if (s.length === 0) {
    return succeed("");
  }
  const first = s.charAt(0);
  return bind(char(first), (c) => map(literal(s.slice(1)), (rest) => c + rest));
}

const token = (c: string): Parser<string> => lexeme(char(c));

const number: Parser<Expr> = lexeme(
  map(many1(digit), (digits) => ({
    type: "num",
    value: Number(digits.join("")),
  })),
);

const addOp: Parser<(left: Expr, right: Expr) => Expr> = map(
  or(token("+"), token("-")),
  (op) => (left, right) => ({
    type: "bin",
    op: op as "+" | "-",
    left,
    right,
  }),
);

const mulOp: Parser<(left: Expr, right: Expr) => Expr> = map(
  or(token("*"), token("/")),
  (op) => (left, right) => ({
    type: "bin",
    op: op as "*" | "/",
    left,
    right,
  }),
);

export const expr: Parser<Expr> = lazy(() => {
  const factor: Parser<Expr> = or(
    number,
    between(token("("), token(")"), expr),
  );
  const term = chainl1(factor, mulOp);
  return skipThen(whitespace, chainl1(term, addOp));
});

export function evalExpr(tree: Expr): number {
  if (tree.type === "num") {
    return tree.value;
  }
  const left = evalExpr(tree.left);
  const right = evalExpr(tree.right);
  switch (tree.op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
  }
}

export function printExpr(tree: Expr): string {
  if (tree.type === "num") {
    return String(tree.value);
  }
  return `(${printExpr(tree.left)}${tree.op}${printExpr(tree.right)})`;
}

const unescapedChar = satisfy(
  (ch) => ch !== '"' && ch !== "\\" && ch !== "\n",
  "string character",
);

const escapeSeq: Parser<string> = skipThen(
  char("\\"),
  choice(
    [
      map(char('"'), () => '"'),
      map(char("\\"), () => "\\"),
      map(char("/"), () => "/"),
      map(char("n"), () => "\n"),
      map(char("t"), () => "\t"),
      map(char("r"), () => "\r"),
    ],
    "escape",
  ),
);

const jsonNull: Parser<null> = lexeme(map(literal("null"), () => null));

const jsonBoolean: Parser<boolean> = lexeme(
  or(
    map(literal("true"), () => true),
    map(literal("false"), () => false),
  ),
);

const fraction: Parser<string> = bind(char("."), (dot) =>
  map(many1(digit), (digits) => dot + digits.join("")),
);

const jsonNumber: Parser<number> = lexeme(
  bind(optional(char("-")), (sign) =>
    bind(many1(digit), (intPart) =>
      map(optional(fraction), (frac) =>
        Number((sign ?? "") + intPart.join("") + (frac ?? "")),
      ),
    ),
  ),
);

const jsonString: Parser<string> = lexeme(
  between(
    char('"'),
    char('"'),
    map(many(or(unescapedChar, escapeSeq)), (chars) => chars.join("")),
  ),
);

export const jsonValue: Parser<Json> = lazy(() =>
  choice(
    [jsonNull, jsonBoolean, jsonNumber, jsonString, jsonArray, jsonObject],
    "json value",
  ),
);

const comma = lexeme(char(","));
const colon = lexeme(char(":"));

export const jsonArray: Parser<Json> = between(
  lexeme(char("[")),
  lexeme(char("]")),
  sepBy(jsonValue, comma),
);

const jsonMember: Parser<[string, Json]> = bind(jsonString, (key) =>
  skipThen(
    colon,
    map(jsonValue, (value) => [key, value]),
  ),
);

const jsonObject: Parser<Json> = between(
  lexeme(char("{")),
  lexeme(char("}")),
  map(sepBy(jsonMember, comma), (entries) => Object.fromEntries(entries)),
);

export const json: Parser<Json> = skipThen(whitespace, jsonValue);

export const goldenParsers = {
  expr,
  json,
  jsonArray,
} as const;

export type GoldenParserName = keyof typeof goldenParsers;
