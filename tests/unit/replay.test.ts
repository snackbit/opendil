import { expect, it } from "vitest";
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import { tokenOffsets } from "../../apps/site/components/playback/token-index";
import {
  approximateOffsets,
  packOffsets,
  unpackOffsets,
  ReplayClock,
  ratePosition,
  positionRate,
  validRate,
  stressChunk,
} from "../../apps/site/components/playback/replay-delivery";
it.each([
  "",
  "A streamed document\n<box>hello</box>",
  "\uFEFF日本語 🧑🏽‍💻 café\r\n<|endoftext|>",
  "Καλημέρα 🌋 한글 e\u0301",
])("indexes exact, Unicode-safe source prefixes: %s", (source) => {
  const offsets = tokenOffsets(source);
  expect(offsets.length).toBe(
    encode(source, { disallowedSpecial: new Set() }).length + 1,
  );
  expect(offsets[0]).toBe(0);
  expect(offsets.at(-1)).toBe(source.length);
  let previous = 0;
  for (const offset of offsets) {
    expect(offset).toBeGreaterThanOrEqual(previous);
    expect(source.slice(0, offset)).not.toMatch(/[\uD800-\uDBFF]$/);
    previous = offset;
  }
});
it.each([
  "",
  "A streamed document\n<box>hello</box>",
  "﻿日本語 🧑🏽‍💻 café\r\n<|endoftext|>",
  "  indented    words_and_123 numbers!!",
  "bad\ud800string",
])("approximates exact, Unicode-safe source prefixes: %s", (source) => {
  const offsets = approximateOffsets(source);
  expect(offsets[0]).toBe(0);
  expect(offsets.at(-1)).toBe(source.length);
  for (let index = 1; index < offsets.length; index++) {
    const offset = offsets[index] ?? 0;
    expect(offset).toBeGreaterThan(offsets[index - 1] ?? 0);
    expect(offset - (offsets[index - 1] ?? 0)).toBeLessThanOrEqual(6);
    if (offset < source.length)
      expect(source.slice(0, offset)).not.toMatch(/[\uD800-\uDBFF]$/);
  }
});
it("approximates about one token per four characters of prose", () => {
  const source =
    "Approximate pacing keeps a replay moving when tokenizing fails.";
  const count = approximateOffsets(source).length - 1;
  const exact = encode(source).length;
  expect(count).toBeGreaterThanOrEqual(exact);
  expect(count).toBeLessThanOrEqual(exact * 2);
});
it("packs token offsets losslessly, including long whitespace tokens", () => {
  for (const source of ["", "word ".repeat(30), " ".repeat(200) + "x"]) {
    const offsets = tokenOffsets(source);
    expect(unpackOffsets(packOffsets(offsets))).toEqual(offsets);
  }
});
it("rejects sources that cannot survive tokenizer Unicode encoding losslessly", () => {
  expect(() => tokenOffsets("bad\ud800string")).toThrow("losslessly");
});
it("accounts for fractional tokens, variable frame durations, rate changes and paused time", () => {
  const clock = new ReplayClock(0, 1);
  expect(clock.advance(500)).toBe(0);
  expect(clock.advance(999)).toBe(0);
  expect(clock.advance(1000)).toBe(1);
  clock.setRate(1500, 50);
  expect(clock.advance(1510)).toBe(2);
  clock.rebase(10000);
  expect(clock.advance(10020)).toBe(3);
  clock.setRate(10020, 1000);
  expect(clock.advance(10053)).toBe(36);
});
it("maps the slider logarithmically and keeps stress profiles separate", () => {
  for (const rate of [1, 2, 10, 50, 100, 999, 1000]) {
    expect(positionRate(ratePosition(rate))).toBe(rate);
    expect(validRate(rate)).toBe(true);
  }
  expect(positionRate(1000 / 3)).toBe(10);
  for (const rate of [NaN, Infinity, 0, -1, 0.1, 1001])
    expect(validRate(rate)).toBe(false);
  expect(stressChunk("large", "1")).toBe(4096);
  expect(stressChunk("showcase", "4")).toBe(512);
});
