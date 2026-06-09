import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLibrary } from "@/context/LibraryContext";
import { loadTtsSettings, DEFAULT_TTS_SETTINGS } from "@/lib/storage";
import { chunkText, speak, stop as stopTts } from "@/lib/tts";
import { estimateMinutes } from "@/lib/parser";
import { ProgressBar } from "@/components/ui";
import { TtsSettings } from "@/types";
import { colors, fontSize, radius, spacing } from "@/theme";

// 播放器：原 Web 端「计划中」的核心功能，在移动端通过 expo-speech 真正实现。
export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { getBook, updateProgress } = useLibrary();
  const book = getBook(id);

  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [playing, setPlaying] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);

  // 文本分段（依赖书籍内容，仅在内容变化时重算）
  const chunks = useMemo(
    () => (book?.content ? chunkText(book.content) : []),
    [book?.content]
  );

  // 每段起始字符偏移，用于计算整体进度
  const offsets = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const c of chunks) {
      arr.push(acc);
      acc += c.length;
    }
    return arr;
  }, [chunks]);

  const totalChars = book?.content?.length ?? 0;
  const playingRef = useRef(false);
  const indexRef = useRef(0);

  // 根据已保存的 charIndex 恢复到对应分段
  useEffect(() => {
    if (!book || chunks.length === 0) return;
    loadTtsSettings().then(setSettings);
    const resumeChar = book.charIndex ?? 0;
    let start = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= resumeChar) start = i;
      else break;
    }
    setChunkIndex(start);
    indexRef.current = start;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, chunks.length]);

  const persist = useCallback(
    (idx: number) => {
      if (!book) return;
      const charIndex = offsets[idx] ?? 0;
      const progress =
        totalChars > 0 ? Math.min(100, Math.round((charIndex / totalChars) * 100)) : 0;
      updateProgress(book.id, charIndex, progress);
    },
    [book, offsets, totalChars, updateProgress]
  );

  const playFrom = useCallback(
    (idx: number) => {
      if (!book || idx >= chunks.length) {
        // 播放完毕
        playingRef.current = false;
        setPlaying(false);
        if (book) updateProgress(book.id, totalChars, 100);
        return;
      }
      indexRef.current = idx;
      setChunkIndex(idx);
      persist(idx);
      speak(chunks[idx], {
        settings,
        onDone: () => {
          if (!playingRef.current) return;
          playFrom(idx + 1);
        },
      });
    },
    [book, chunks, settings, persist, totalChars, updateProgress]
  );

  const handlePlayPause = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      stopTts();
      persist(indexRef.current);
    } else {
      playingRef.current = true;
      setPlaying(true);
      playFrom(indexRef.current);
    }
  }, [playFrom, persist]);

  const skip = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(chunks.length - 1, indexRef.current + delta));
      const wasPlaying = playingRef.current;
      stopTts();
      indexRef.current = next;
      setChunkIndex(next);
      persist(next);
      if (wasPlaying) {
        playFrom(next);
      }
    },
    [chunks.length, persist, playFrom]
  );

  // 离开页面时停止朗读并保存进度
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      playingRef.current = false;
      stopTts();
      persist(indexRef.current);
    });
    return unsub;
  }, [navigation, persist]);

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>未找到该书籍。</Text>
      </View>
    );
  }

  const progressPct =
    totalChars > 0 ? Math.round(((offsets[chunkIndex] ?? 0) / totalChars) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.cover}>
          <Ionicons name="book" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.meta}>
          约 {estimateMinutes(book.content ?? "")} 分钟 · {chunks.length} 段
        </Text>
      </View>

      {/* 当前朗读文本，高亮当前段 */}
      <ScrollView style={styles.reader} contentContainerStyle={styles.readerContent}>
        {chunks.map((c, i) => (
          <Pressable key={i} onPress={() => skip(i - indexRef.current)}>
            <Text style={[styles.chunk, i === chunkIndex && styles.chunkActive]}>
              {c}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* 控制栏 */}
      <View style={styles.controls}>
        <View style={styles.progressWrap}>
          <ProgressBar value={progressPct} />
          <View style={styles.progressLabels}>
            <Text style={styles.muted}>{progressPct}%</Text>
            <Text style={styles.muted}>
              第 {chunkIndex + 1} / {chunks.length} 段
            </Text>
          </View>
        </View>
        <View style={styles.buttons}>
          <Pressable style={styles.secondaryBtn} onPress={() => skip(-1)}>
            <Ionicons name="play-skip-back" size={26} color={colors.text} />
          </Pressable>
          <Pressable style={styles.playBtn} onPress={handlePlayPause}>
            <Ionicons name={playing ? "pause" : "play"} size={34} color="#fff" />
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => skip(1)}>
            <Ionicons name="play-skip-forward" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  header: { alignItems: "center", paddingTop: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.sm },
  cover: {
    width: 120,
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.iconBg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.text, textAlign: "center" },
  meta: { fontSize: fontSize.sm, color: colors.textMuted },
  reader: { flex: 1, marginTop: spacing.md, paddingHorizontal: spacing.lg },
  readerContent: { paddingBottom: spacing.lg },
  chunk: { fontSize: fontSize.md, lineHeight: 26, color: colors.textMuted, marginBottom: spacing.xs },
  chunkActive: { color: colors.text, backgroundColor: "#dbeafe", borderRadius: radius.sm },
  controls: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  progressWrap: { gap: spacing.xs },
  progressLabels: { flexDirection: "row", justifyContent: "space-between" },
  buttons: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xl },
  secondaryBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.iconBg,
  },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
});
