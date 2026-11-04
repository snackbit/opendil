// Theme data crosses from the host application into the opaque-origin frame.
// The frame validates it here; the host runs the same check only to warn early.

export type Appearance = "light" | "dark";
export type ThemeTokens = Readonly<Record<`--${string}`, string>>;
export interface FrameTheme {
  appearance: Appearance;
  tokens: ThemeTokens;
}

const MAX_TOKENS = 256;
const MAX_VALUE_LENGTH = 256;
const TOKEN_NAME = /^--[A-Za-z0-9_-]{1,64}$/;
// Values may only style: no resource loading (url(), image-set(), image(),
// cross-fade(), element(), src()), no at-rules, no escapes, no comments and no
// characters that could end the declaration or its block.
const UNSAFE_VALUE =
  // eslint-disable-next-line no-control-regex
  /[;{}\\@<>!`\u0000-\u001f\u007f]|\/\*|\*\/|(?:url|image-set|image|cross-fade|element|src|expression)\s*\(/i;

export function isSafeTokenValue(value: string) {
  return (
    value.length <= MAX_VALUE_LENGTH &&
    !UNSAFE_VALUE.test(value) &&
    value.split('"').length % 2 === 1 &&
    value.split("'").length % 2 === 1
  );
}

/** Keeps valid custom properties and names everything it drops. */
export function readThemeTokens(value: unknown): {
  tokens: ThemeTokens;
  rejected: string[];
} {
  const tokens: Record<`--${string}`, string> = {};
  const rejected: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { tokens, rejected };
  for (const [index, [name, token]] of Object.entries(value).entries()) {
    if (
      index < MAX_TOKENS &&
      TOKEN_NAME.test(name) &&
      typeof token === "string" &&
      isSafeTokenValue(token)
    )
      tokens[name as `--${string}`] = token;
    else rejected.push(name.slice(0, 80));
  }
  return { tokens, rejected };
}

/** Parses a port message into a theme, or returns undefined to ignore it. */
export function readFrameTheme(data: object): FrameTheme | undefined {
  if (
    !("appearance" in data) ||
    (data.appearance !== "light" && data.appearance !== "dark")
  )
    return undefined;
  return {
    appearance: data.appearance,
    tokens: readThemeTokens("tokens" in data ? data.tokens : undefined).tokens,
  };
}
