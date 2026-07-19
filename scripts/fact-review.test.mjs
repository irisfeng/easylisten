import test from "node:test";
import assert from "node:assert/strict";
import {
  findUnsupportedHighRiskClaims,
  validateFactReview,
} from "./lib/fact-review.mjs";

const source = `常规时间内，西班牙队15次射门均无功而返，而阿根廷队没有完成任何一脚打门。
进入加时赛后，尼科·威廉斯在第95分钟打入一球，但进球被判无效。
直至比赛第106分钟，费兰·托雷斯禁区内劲射完成破门。`;

test("拦截世界杯错误稿里原文不存在的分钟、奖项和引语", () => {
  const issues = findUnsupportedHighRiskClaims(
    {
      title: "西班牙夺冠",
      intro: "",
      paragraphs: [
        "经过九十分钟的对抗，西班牙队以1比0获胜。",
        "费兰·托雷斯赛后被评为全场最佳球员。",
        "他说：“这是我一生中最美好的时刻。”",
      ],
    },
    source,
  );
  assert.equal(issues.length, 4);
  assert.match(issues.join("\n"), /第 90 分钟/);
  assert.match(issues.join("\n"), /全场最佳球员/);
  assert.match(issues.join("\n"), /原文中找不到引语/);
});

test("事实二审要求每段都有原文中的连续证据", () => {
  assert.throws(
    () =>
      validateFactReview(
        {
          final: {
            title: "加时赛第106分钟破门",
            intro: "常规时间互交白卷。",
            paragraphs: ["常规时间没有进球。", "第106分钟完成破门。", "西班牙最终夺冠。"],
          },
          evidence: [
            { paragraphIndex: 0, sourceQuote: "常规时间内，西班牙队15次射门均无功而返" },
          ],
        },
        source,
      ),
    /第 2、3 段/,
  );
});
