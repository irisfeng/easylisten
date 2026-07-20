export const CHINESE_FEMALE_VOICE = "presenter_female";
export const CHINESE_MALE_VOICE = "male-qn-jingying";
export const ENGLISH_FEMALE_VOICE = "en-US-AriaNeural";

/**
 * 正式中文节目固定提供两条 MiniMax 声线。目录约定由播放器和工作流共用：
 * <slug> 为女声，<slug>-m 为男声。
 */
export function audioPlanForPiece(piece) {
  if (piece.en) {
    return [
      {
        unit: piece.slug,
        language: "zh",
        gender: "f",
        engine: "minimax",
        voice: CHINESE_FEMALE_VOICE,
        paragraphs: piece.paragraphs,
      },
      {
        unit: `${piece.slug}-en`,
        language: "en",
        gender: "f",
        engine: "edge",
        voice: ENGLISH_FEMALE_VOICE,
        paragraphs: piece.en.paragraphs,
      },
    ];
  }
  return [
    {
      unit: piece.slug,
      language: "zh",
      gender: "f",
      engine: "minimax",
      voice: CHINESE_FEMALE_VOICE,
      paragraphs: piece.paragraphs,
    },
    {
      unit: `${piece.slug}-m`,
      language: "zh",
      gender: "m",
      engine: "minimax",
      voice: CHINESE_MALE_VOICE,
      paragraphs: piece.paragraphs,
    },
  ];
}

export function missingRequiredAudioUnits(pieces, manifestSlugs) {
  const available = new Set(manifestSlugs);
  return pieces.flatMap((piece) =>
    audioPlanForPiece(piece).filter(({ unit }) => !available.has(unit)),
  );
}

/**
 * daily.json 会保留往期内容供回听。默认每日任务只对最新一期执行新音频契约，
 * 避免规则升级后追溯生成全部历史音轨；历史稿由阅读页按 manifest 渐进兼容。
 */
export function latestIssuePieces(pieces) {
  const dated = pieces.filter((piece) => typeof piece.publishedAt === "string");
  if (!dated.length) return [];
  const latestDate = dated.reduce(
    (latest, piece) => (piece.publishedAt > latest ? piece.publishedAt : latest),
    dated[0].publishedAt,
  );
  return dated.filter((piece) => piece.publishedAt === latestDate);
}
