import AsyncStorage from "@react-native-async-storage/async-storage";
import { Book, TtsSettings, User } from "@/types";

// 本地持久化层。原 Web 端使用 Prisma + PostgreSQL，
// 移动端改为 AsyncStorage（键值存储）。
const KEYS = {
  books: "easylisten.books",
  session: "easylisten.session",
  ttsSettings: "easylisten.ttsSettings",
};

// ---------- 书库 ----------

export async function loadBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(KEYS.books);
  if (!raw) return [];
  try {
    const books = JSON.parse(raw) as Book[];
    // 最近更新的排在前面
    return books.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function saveBooks(books: Book[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.books, JSON.stringify(books));
}

export async function upsertBook(book: Book): Promise<Book[]> {
  const books = await loadBooks();
  const idx = books.findIndex((b) => b.id === book.id);
  if (idx >= 0) {
    books[idx] = book;
  } else {
    books.unshift(book);
  }
  await saveBooks(books);
  return books;
}

export async function deleteBook(id: string): Promise<Book[]> {
  const books = (await loadBooks()).filter((b) => b.id !== id);
  await saveBooks(books);
  return books;
}

// ---------- 会话 ----------

export async function loadSession(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(KEYS.session);
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function saveSession(user: User | null): Promise<void> {
  if (user) {
    await AsyncStorage.setItem(KEYS.session, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(KEYS.session);
  }
}

// ---------- 朗读设置 ----------

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  language: "zh-CN",
  rate: 1.0,
  pitch: 1.0,
};

export async function loadTtsSettings(): Promise<TtsSettings> {
  const raw = await AsyncStorage.getItem(KEYS.ttsSettings);
  return raw
    ? { ...DEFAULT_TTS_SETTINGS, ...(JSON.parse(raw) as TtsSettings) }
    : DEFAULT_TTS_SETTINGS;
}

export async function saveTtsSettings(settings: TtsSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.ttsSettings, JSON.stringify(settings));
}
