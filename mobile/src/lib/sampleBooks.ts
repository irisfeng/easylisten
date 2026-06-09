import { Book } from "@/types";

// 内置示例书籍：让用户首次打开 App 即可体验「上传 → 解析 → 收听」的完整流程，
// 而无需先准备文件。对应原 Web 端 HomePage 中的 `recentBooks` 模拟数据，
// 但这里带有真实可朗读的文本内容。
function makeSample(
  id: string,
  title: string,
  content: string,
  progress = 0
): Book {
  const now = new Date().toISOString();
  return {
    id,
    title,
    originalFileName: `${title}.txt`,
    mimeType: "text/plain",
    content,
    processingStatus: "SUCCESS",
    progress,
    charIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export const SAMPLE_BOOKS: Book[] = [
  makeSample(
    "sample-welcome",
    "欢迎使用轻听",
    "欢迎使用轻听。轻听是您的个人有声书转换和播放平台，致力于让阅读变得轻松。" +
      "您可以上传自己的电子书文件，例如 TXT 文本，系统会自动提取文字内容，" +
      "并通过高质量的文本转语音技术为您朗读。点击下方的播放按钮，现在就开始收听吧。" +
      "在设置中，您还可以调整朗读的语言、语速与音调，找到最适合自己的收听节奏。",
    15
  ),
  makeSample(
    "sample-tang-poem",
    "唐诗三首",
    "静夜思。床前明月光，疑是地上霜。举头望明月，低头思故乡。" +
      "登鹳雀楼。白日依山尽，黄河入海流。欲穷千里目，更上一层楼。" +
      "春晓。春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。",
    0
  ),
  makeSample(
    "sample-english",
    "The Quiet Reader",
    "Reading should be effortless. EasyListen turns your books into a calm, " +
      "natural voice that follows you anywhere. Upload a file, let it be parsed " +
      "into clean text, and simply press play. Whether you are commuting, " +
      "cooking, or resting your eyes, your library is always ready to be heard.",
    72
  ),
];
