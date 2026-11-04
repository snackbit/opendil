import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readFrameTheme,
  readThemeTokens,
} from "../../packages/opendil/src/dil/isolation/frame-theme";
import {
  checkFrameVersion,
  reportRejectedTokens,
  reportStartupFailure,
  RUNTIME_VERSION,
  startupFailureMessage,
} from "../../packages/opendil/src/dil/isolation/frame-startup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("iframe theme boundary", () => {
  it("keeps ordinary design tokens", () => {
    const tokens = {
      "--primary": "#5e4cff",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--radius": "12px",
      "--background": "transparent",
      "--chart-1": "color-mix(in srgb, var(--primary) 40%, white)",
      "--font-dil": '"Inter Variable", system-ui, sans-serif',
      "--shadow_2": "0 1px 2px rgb(0 0 0 / 0.2)",
    };
    expect(readThemeTokens(tokens)).toEqual({ tokens, rejected: [] });
  });
  it.each([
    ["--image", "url(https://tracker.example/pixel.png)"],
    ["--image", "URL ( data:image/png;base64,AAAA )"],
    ["--image", "image-set('a.png' 1x)"],
    ["--image", "-webkit-image-set('a.png' 1x)"],
    ["--image", "cross-fade(red, blue)"],
    ["--image", "src('a.png')"],
    ["--image", "element(#secret)"],
    ["--break", "red; background: blue"],
    ["--break", "red} body{background:url(x)"],
    ["--break", "red{"],
    ["--escape", "u\\72l(x)"],
    ["--at", "@import 'x.css'"],
    ["--important", "red !important"],
    ["--comment", "red /* note */"],
    ["--tag", "</style><script>"],
    ["--quote", '"unterminated'],
    ["--quote", "'unterminated"],
    ["--newline", "red\nblue"],
    ["--long", "a".repeat(257)],
    ["color", "red"],
    ["--", "red"],
    ["--has space", "red"],
    ["--x:y", "red"],
    ["--" + "a".repeat(65), "red"],
  ])("drops %s: %s", (name, value) => {
    const { tokens, rejected } = readThemeTokens({
      [name]: value,
      "--kept": "red",
    });
    expect(tokens).toEqual({ "--kept": "red" });
    expect(rejected).toEqual([name.slice(0, 80)]);
  });
  it("drops non-string values, non-objects and tokens past the count limit", () => {
    expect(readThemeTokens({ "--n": 1, "--o": {} }).rejected).toEqual([
      "--n",
      "--o",
    ]);
    for (const value of [null, undefined, "--x: red", ["--x"], 3])
      expect(readThemeTokens(value)).toEqual({ tokens: {}, rejected: [] });
    const many = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => ["--t" + index, "red"]),
    );
    const { tokens, rejected } = readThemeTokens(many);
    expect(Object.keys(tokens)).toHaveLength(256);
    expect(rejected).toHaveLength(44);
  });
  it("accepts only a known appearance from the port", () => {
    expect(
      readFrameTheme({ appearance: "dark", tokens: { "--primary": "red" } }),
    ).toEqual({ appearance: "dark", tokens: { "--primary": "red" } });
    expect(readFrameTheme({ appearance: "light" })).toEqual({
      appearance: "light",
      tokens: {},
    });
    expect(readFrameTheme({ appearance: "dim" })).toBeUndefined();
    expect(readFrameTheme({ tokens: {} })).toBeUndefined();
  });
});

describe("iframe startup diagnostics", () => {
  it("names the URL, the copy command and runtimeBaseUrl once per URL", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = "https://app.example/chat/opendil/frame.html";
    expect(startupFailureMessage(url)).toContain(url);
    expect(startupFailureMessage(url)).toContain("npx opendil copy-assets");
    expect(startupFailureMessage(url)).toContain("runtimeBaseUrl");
    reportStartupFailure(url);
    reportStartupFailure(url);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain("404");
  });
  it("warns once when the copied runtime is from another version", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkFrameVersion("https://a.example/frame.html", RUNTIME_VERSION);
    expect(warn).not.toHaveBeenCalled();
    checkFrameVersion("https://b.example/frame.html", "0.0.9");
    checkFrameVersion("https://b.example/frame.html", "0.0.9");
    // Frames that predate the handshake announce no version.
    checkFrameVersion("https://c.example/frame.html", undefined);
    checkFrameVersion("https://d.example/frame.html", "<b>bad</b>");
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining("is version 0.0.9, but the renderer is version"),
      expect.stringContaining("is an earlier version"),
      expect.stringContaining("is an earlier version"),
    ]);
    expect(String(warn.mock.calls[0]?.[0])).toContain("copy-assets");
  });
  it("warns once per ignored theme token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportRejectedTokens(["--image", "--image", "--other"]);
    reportRejectedTokens(["--image"]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
