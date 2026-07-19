import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sources = JSON.parse(
  readFileSync(resolve(root, "content/sources.json"), "utf8"),
).sources;

const categories = new Set([
  "science",
  "tech",
  "society",
  "humanities",
  "living",
  "culture",
]);
const profiles = new Set(["depth", "analysis", "realtime", "discovery"]);
const sourceFormats = new Set(["sitemap", "listing"]);
const ageBands = new Set(["6-9", "10-12", "13-16"]);

test("信息源配置完整、唯一且落在受控分层内", () => {
  assert.ok(Array.isArray(sources) && sources.length > 0);
  assert.equal(new Set(sources.map((source) => source.name)).size, sources.length);
  assert.equal(new Set(sources.map((source) => source.feed)).size, sources.length);

  for (const source of sources) {
    assert.ok(source.name?.trim(), "source name is required");
    assert.match(source.feed, /^https:\/\//, `${source.name}: feed must use HTTPS`);
    if (source.format !== undefined) {
      assert.ok(sourceFormats.has(source.format), `${source.name}: unsupported source format`);
    }
    if (source.preferPattern !== undefined) {
      assert.doesNotThrow(() => new RegExp(source.preferPattern), `${source.name}: invalid preferPattern`);
    }
    assert.ok(categories.has(source.category), `${source.name}: invalid category`);
    assert.ok(["zh", "en"].includes(source.lang), `${source.name}: invalid language`);
    assert.ok(
      source.weight >= 0.8 && source.weight <= 1.2,
      `${source.name}: weight must be between 0.8 and 1.2`,
    );
    assert.ok(profiles.has(source.profile), `${source.name}: invalid profile`);
    if (source.maxItems !== undefined) {
      assert.ok(
        Number.isInteger(source.maxItems) && source.maxItems >= 1 && source.maxItems <= 10,
        `${source.name}: maxItems must be an integer from 1 to 10`,
      );
    }
    if (source.minAgeBand !== undefined) {
      assert.ok(ageBands.has(source.minAgeBand), `${source.name}: invalid minAgeBand`);
    }
    assert.ok(
      Number.isInteger(source.maxAgeDays) &&
        source.maxAgeDays >= 1 &&
        source.maxAgeDays <= 14,
      `${source.name}: maxAgeDays must be an integer from 1 to 14`,
    );
    if (source.region !== undefined) {
      assert.ok(["mainland", "international"].includes(source.region));
    }
    if (source.region === "mainland") {
      assert.ok(source.publisher?.trim(), `${source.name}: mainland source requires publisher`);
    }
  }
});

test("源库保持中文可见度和高信任核心源占比", () => {
  const chineseShare = sources.filter((source) => source.lang === "zh").length / sources.length;
  const coreShare = sources.filter((source) => source.weight >= 1.1).length / sources.length;

  assert.ok(chineseShare >= 0.3, `Chinese source share too low: ${chineseShare}`);
  assert.ok(coreShare >= 0.4, `Core source share too low: ${coreShare}`);
});

test("国内源不是装饰性配额，并覆盖少年刊需要的主要领域", () => {
  const mainland = sources.filter((source) => source.region === "mainland");
  assert.ok(mainland.length >= 21, `Mainland source count too low: ${mainland.length}`);
  for (const category of ["science", "society", "humanities", "living", "culture"]) {
    assert.ok(
      mainland.some((source) => source.category === category),
      `Missing mainland source for ${category}`,
    );
  }
  assert.ok(
    mainland.filter((source) => source.weight >= 1.1).length >= 12,
    "Mainland source expansion must preserve the high-trust bar",
  );
  const publishers = new Set(mainland.map((source) => source.publisher));
  assert.ok(publishers.size >= 12, `Mainland publisher diversity too low: ${publishers.size}`);
  const publisherCounts = new Map();
  for (const source of mainland) {
    publisherCounts.set(source.publisher, (publisherCounts.get(source.publisher) ?? 0) + 1);
  }
  assert.ok(
    [...publisherCounts.values()].every((count) => count <= 5),
    "Do not inflate mainland coverage with too many channels from one publisher",
  );
});

test("召回时窗匹配信息源角色", () => {
  const depthSources = sources.filter((source) => source.profile === "depth");
  const realtimeSources = sources.filter((source) => source.profile === "realtime");

  assert.ok(depthSources.every((source) => source.maxAgeDays >= 7));
  assert.ok(realtimeSources.every((source) => source.maxAgeDays <= 3));
});

test("实时体育进入召回池，但必须来自高信任源", () => {
  const sportsSources = sources.filter(
    (source) => source.category === "culture" && source.profile === "realtime",
  );
  assert.ok(sportsSources.length >= 1);
  assert.ok(sportsSources.every((source) => source.weight >= 1.0));
});
