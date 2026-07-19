import assert from "node:assert/strict";
import test from "node:test";
import { isPieceForAge } from "../src/lib/content.ts";

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
