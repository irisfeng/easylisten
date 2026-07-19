export const CHINESE_FEMALE_VOICE = "presenter_female";
export const CHINESE_MALE_VOICE = "male-qn-jingying";

/**
 * 正式中文节目固定提供两条 MiniMax 声线。目录约定由播放器和工作流共用：
 * <slug> 为女声，<slug>-m 为男声。
 */
export function chineseVoicePlan(slug) {
  return [
    { unit: slug, gender: "f", voice: CHINESE_FEMALE_VOICE },
    { unit: `${slug}-m`, gender: "m", voice: CHINESE_MALE_VOICE },
  ];
}

export function missingChineseVoiceUnits(slugs, manifestSlugs) {
  const available = new Set(manifestSlugs);
  return slugs.flatMap((slug) =>
    chineseVoicePlan(slug)
      .filter(({ unit }) => !available.has(unit))
      .map(({ unit }) => unit),
  );
}
