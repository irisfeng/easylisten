import React from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLibrary } from "@/context/LibraryContext";
import { BookCard } from "@/components/BookCard";
import { AppButton } from "@/components/ui";
import { colors, fontSize, spacing } from "@/theme";

// 书库主页：展示最近书籍，对应 Web 端 HomePage 的「最近听过的书籍」区块。
export default function LibraryScreen() {
  const { books, loading, refresh, deleteBook } = useLibrary();
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function confirmDelete(id: string, title: string) {
    Alert.alert("删除书籍", `确定要从书库中删除《${title}》吗？`, [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => deleteBook(id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>轻听, 让阅读变得轻松</Text>
            <Text style={styles.heroSubtitle}>
              上传您的电子书, 通过文本转语音技术开始听书
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BookCard
            book={item}
            onPress={() => {
              if (item.processingStatus === "SUCCESS") {
                router.push(`/player/${item.id}`);
              } else if (item.processingStatus === "FAILED") {
                Alert.alert("无法播放", item.errorMessage ?? "该书籍解析失败。");
              } else {
                Alert.alert("请稍候", "该书籍仍在解析中。");
              }
            }}
            onLongPress={() => confirmDelete(item.id, item.title)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>书库还是空的</Text>
              <AppButton
                title="去上传一本书"
                onPress={() => router.push("/(tabs)/upload")}
                style={{ marginTop: spacing.md }}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  hero: { marginBottom: spacing.lg, marginTop: spacing.sm },
  heroTitle: { fontSize: fontSize.xl, fontWeight: "800", color: colors.text },
  heroSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  empty: { alignItems: "center", paddingVertical: spacing.xl * 2 },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.sm },
});
