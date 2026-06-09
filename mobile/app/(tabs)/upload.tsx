import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLibrary } from "@/context/LibraryContext";
import { AppButton, Card } from "@/components/ui";
import { colors, fontSize, radius, spacing } from "@/theme";

type Phase = "idle" | "processing" | "success" | "error";

// 上传页：用系统文件选择器（expo-document-picker）替代 Web 端的拖拽上传，
// 选取文件后复制到沙盒并本地解析，对应原 /api/upload + /api/process-book 流程。
export default function UploadScreen() {
  const { addBook } = useLibrary();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [lastBookId, setLastBookId] = useState<string | null>(null);

  async function handlePick() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/plain",
          "application/pdf",
          "application/epub+zip",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];

      setPhase("processing");
      setMessage("正在解析文件...");

      const id = await addBook({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
      });
      setLastBookId(id);
      setPhase("success");
      setMessage("处理完成！已加入您的书库。");
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "上传失败");
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Card style={styles.dropzone}>
        {phase === "idle" && (
          <>
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-upload" size={32} color={colors.textMuted} />
            </View>
            <Text style={styles.title}>选择一本电子书</Text>
            <Text style={styles.subtitle}>支持 TXT、PDF、EPUB、DOC、DOCX</Text>
            <AppButton
              title="选择文件"
              onPress={handlePick}
              icon={<Ionicons name="book" size={18} color="#fff" />}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}

        {phase === "processing" && (
          <>
            <Ionicons name="hourglass" size={40} color={colors.primary} />
            <Text style={styles.title}>{message}</Text>
          </>
        )}

        {phase === "success" && (
          <>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <Text style={styles.title}>{message}</Text>
            <View style={styles.row}>
              <AppButton
                title="去收听"
                onPress={() => lastBookId && router.push(`/player/${lastBookId}`)}
                style={{ flex: 1 }}
              />
              <AppButton
                title="再传一本"
                variant="outline"
                onPress={() => setPhase("idle")}
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {phase === "error" && (
          <>
            <Ionicons name="alert-circle" size={56} color={colors.error} />
            <Text style={styles.title}>{message}</Text>
            <AppButton
              title="重试"
              variant="outline"
              onPress={() => setPhase("idle")}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </Card>

      <Card style={styles.note}>
        <Text style={styles.noteTitle}>关于文件解析</Text>
        <Text style={styles.noteText}>
          纯文本（.txt）可在设备本地直接解析并朗读。PDF / EPUB / DOCX 等格式在原
          Web 端依赖服务端解析，移动端可后续接入云端解析服务后启用。
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  dropzone: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.iconBg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" },
  note: { gap: spacing.xs },
  noteTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.text },
  noteText: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
});
