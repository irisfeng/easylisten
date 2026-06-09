import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as FileSystem from "expo-file-system";
import { Book, ProcessingStatus } from "@/types";
import {
  deleteBook as removeBook,
  loadBooks,
  saveBooks,
  upsertBook,
} from "@/lib/storage";
import { parseFileContent, mimeFromName } from "@/lib/parser";
import { SAMPLE_BOOKS } from "@/lib/sampleBooks";

interface AddFileInput {
  uri: string;
  name: string;
  mimeType?: string | null;
}

interface LibraryContextValue {
  books: Book[];
  loading: boolean;
  /** 选取文件后：复制到沙盒 → 解析 → 入库，返回新书 id */
  addBook: (file: AddFileInput) => Promise<string>;
  getBook: (id: string) => Book | undefined;
  updateProgress: (id: string, charIndex: number, progress: number) => void;
  deleteBook: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

const BOOKS_DIR = `${FileSystem.documentDirectory}books/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(BOOKS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BOOKS_DIR, { intermediates: true });
  }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const stored = await loadBooks();
    if (stored.length === 0) {
      // 首次使用：注入内置示例书籍
      await saveBooks(SAMPLE_BOOKS);
      setBooks(SAMPLE_BOOKS);
    } else {
      setBooks(stored);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addBook = useCallback(async (file: AddFileInput): Promise<string> => {
    await ensureDir();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mimeType = file.mimeType || mimeFromName(file.name);
    const title = file.name.replace(/\.[^.]+$/, "");
    const now = new Date().toISOString();

    // 1. 复制文件到 App 沙盒（替代原 Web 端的 R2 对象存储）
    const destUri = `${BOOKS_DIR}${id}-${file.name}`;
    try {
      await FileSystem.copyAsync({ from: file.uri, to: destUri });
    } catch {
      // 某些 provider 的 uri 无法直接 copy，则退化为直接使用原 uri
    }

    let status: ProcessingStatus = "PROCESSING";
    let content: string | undefined;
    let errorMessage: string | undefined;

    // 2. 解析文本内容（替代原 Web 端 `/api/process-book`）
    try {
      const result = await parseFileContent(destUri, mimeType);
      content = result.text;
      status = content.trim() ? "SUCCESS" : "FAILED";
      if (status === "FAILED") errorMessage = "未能从文件中提取到文本内容。";
    } catch (e) {
      status = "FAILED";
      errorMessage = e instanceof Error ? e.message : "解析失败";
    }

    const book: Book = {
      id,
      title,
      originalFileName: file.name,
      mimeType,
      content,
      processingStatus: status,
      errorMessage,
      progress: 0,
      charIndex: 0,
      createdAt: now,
      updatedAt: now,
    };

    const updated = await upsertBook(book);
    setBooks(updated);
    return id;
  }, []);

  const getBook = useCallback(
    (id: string) => books.find((b) => b.id === id),
    [books]
  );

  const updateProgress = useCallback(
    (id: string, charIndex: number, progress: number) => {
      setBooks((prev) => {
        const next = prev.map((b) =>
          b.id === id
            ? { ...b, charIndex, progress, updatedAt: new Date().toISOString() }
            : b
        );
        // 异步落盘，不阻塞 UI
        saveBooks(next);
        return next;
      });
    },
    []
  );

  const deleteBook = useCallback(async (id: string) => {
    const updated = await removeBook(id);
    setBooks(updated);
  }, []);

  const value = useMemo(
    () => ({
      books,
      loading,
      addBook,
      getBook,
      updateProgress,
      deleteBook,
      refresh,
    }),
    [books, loading, addBook, getBook, updateProgress, deleteBook, refresh]
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within a LibraryProvider");
  return ctx;
}
