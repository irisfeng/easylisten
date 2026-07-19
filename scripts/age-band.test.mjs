import assert from "node:assert/strict";
import test from "node:test";
import { formatAgeBands, isPieceForAge } from "../src/lib/content.ts";

test("适龄标签会改变节目单，旧稿保持可见", () => {
  const lowerPrimary = { ageBands: ["6-9"] };
  const middleSchool = { ageBands: ["13-16"] };
  const legacy = {};

  assert.equal(isPieceForAge(lowerPrimary, "6-9"), true);
  assert.equal(isPieceForAge(lowerPrimary, "13-16"), false);
  assert.equal(isPieceForAge(middleSchool, "6-9"), false);
  assert.equal(isPieceForAge(middleSchool, "13-16"), true);
  assert.equal(isPieceForAge(legacy, "6-9"), true);
});

test("适龄文案始终逐段列出，不合并成宽泛年龄范围", () => {
  assert.equal(formatAgeBands(["6-9"]), "6-9 岁");
  assert.equal(
    formatAgeBands(["13-16", "6-9", "10-12"]),
    "6-9 岁、10-12 岁、13-16 岁",
  );
  assert.equal(formatAgeBands(), "适龄信息待复核");
  assert.doesNotMatch(formatAgeBands(["6-9", "10-12", "13-16"]), /6-16/);
});
