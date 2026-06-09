import * as FileSystem from "expo-file-system";

export interface ParseResult {
  text: string;
  metadata?: Record<string, unknown>;
}

// 与 Web 端 `src/lib/parser.ts` 对应的扩展名 -> MIME 映射
export const SUPPORTED_EXTENSIONS = ["txt", "pdf", "epub", "doc", "docx"];

export function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "epub":
      return "application/epub+zip";
    case "txt":
      return "text/plain";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

/**
 * 在设备本地解析文件内容。
 *
 * 纯文本（.txt）可完全在端上解析；PDF / EPUB / DOCX 等二进制格式
 * 在原 Web 端依赖 pdf-parse / mammoth / unzipper 等 Node 库，
 * 这些库无法直接在 React Native 运行时使用。此处对它们做出明确提示，
 * 后续可接入云端解析服务（复用原 `/api/process-book` 逻辑）。
 */
export async function parseFileContent(
  fileUri: string,
  mimeType: string
): Promise<ParseResult> {
  switch (mimeType) {
    case "text/plain":
      return parseTxt(fileUri);
    case "application/pdf":
    case "application/epub+zip":
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      throw new UnsupportedOnDeviceError(mimeType);
    default:
      throw new Error(`不支持的文件类型: ${mimeType}`);
  }
}

export class UnsupportedOnDeviceError extends Error {
  constructor(mimeType: string) {
    super(
      `该格式（${mimeType}）暂不支持端上解析，请使用 .txt 文件，或接入云端解析服务。`
    );
    this.name = "UnsupportedOnDeviceError";
  }
}

async function parseTxt(fileUri: string): Promise<ParseResult> {
  const text = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { text };
}

/** 估算朗读时长（按平均每分钟 ~300 个中文字符 / 英文单词） */
export function estimateMinutes(text: string): number {
  const units = text.trim().length;
  return Math.max(1, Math.round(units / 300));
}
