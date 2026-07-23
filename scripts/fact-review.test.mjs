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

test("事实二审不得把原文未说明等审稿话术写进正式听稿", () => {
  const sourceText = `各地落实健康第一要求，全面推行中小学每天综合体育活动两小时，
普遍探索实施课间十五分钟，身上有汗、眼里有光正在成为现实。
学校在走廊和转角摆放足球、篮球、跳绳等运动器材。`;
  assert.throws(
    () =>
      validateFactReview(
        {
          final: {
            title: "课间十五分钟",
            intro: "各地正在探索延长课间。",
            paragraphs: [
              "各地正在探索实施课间十五分钟。",
              "原文未说明具体原因。",
              "原文未提及家长担忧和受伤风险。",
            ],
          },
          evidence: [0, 1, 2].map((paragraphIndex) => ({
            paragraphIndex,
            sourceQuote: "各地落实健康第一要求，全面推行中小学每天综合体育活动两小时",
          })),
        },
        sourceText,
      ),
    /审稿话术泄漏/,
  );
});

test("英文双语听稿同样不得泄漏 source does not mention 审稿话术", () => {
  const sourceText =
    "Schools are exploring fifteen-minute breaks and two hours of daily physical activity. " +
    "One school places balls and skipping ropes in corridors so children can move during breaks.";
  assert.throws(
    () =>
      validateFactReview(
        {
          final: {
            title: "A Longer School Break",
            intro: "Schools are giving children more time to move.",
            paragraphs: [
              "Some schools are exploring fifteen-minute breaks.",
              "The source does not mention parents' concerns.",
              "One school places sports equipment in its corridors.",
            ],
          },
          evidence: [0, 1, 2].map((paragraphIndex) => ({
            paragraphIndex,
            sourceQuote: "Schools are exploring fifteen-minute breaks and two hours of daily physical activity.",
          })),
        },
        sourceText,
      ),
    /审稿话术泄漏/,
  );
});
