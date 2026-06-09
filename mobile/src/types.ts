// 处理状态：与原 Web 端 Prisma `ProcessingStatus` 枚举保持一致
export type ProcessingStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

// 书籍数据模型（本地版）。原 Web 端存储于 PostgreSQL，
// 移动端改为使用 AsyncStorage 本地持久化。
export interface Book {
  id: string;
  title: string;
  originalFileName: string;
  mimeType: string;
  /** 解析后的纯文本内容（成功后才有） */
  content?: string;
  processingStatus: ProcessingStatus;
  /** 解析失败时的原因 */
  errorMessage?: string;
  /** 收听进度 0-100（基于已朗读字符占比） */
  progress: number;
  /** TTS 续播位置（字符索引） */
  charIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

// 朗读（TTS）偏好设置
export interface TtsSettings {
  language: string;
  rate: number; // 0.1 - 2.0
  pitch: number; // 0.5 - 2.0
}
