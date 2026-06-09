import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Book } from "@/types";
import { colors, fontSize, radius, spacing } from "@/theme";
import { ProgressBar, StatusPill } from "./ui";

export function BookCard({
  book,
  onPress,
  onLongPress,
}: {
  book: Book;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.cover}>
        <Ionicons name="book" size={28} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {book.title}
          </Text>
          <StatusPill status={book.processingStatus} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {book.originalFileName}
        </Text>
        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={book.progress} />
          </View>
          <Text style={styles.percent}>{book.progress}%</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cover: {
    width: 56,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.iconBg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, justifyContent: "center", gap: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  percent: { fontSize: fontSize.xs, color: colors.textMuted, width: 36, textAlign: "right" },
});
