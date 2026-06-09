import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { useAuth } from "@/context/AuthContext";
import { AppButton, Card } from "@/components/ui";
import {
  DEFAULT_TTS_SETTINGS,
  loadTtsSettings,
  saveTtsSettings,
} from "@/lib/storage";
import { TtsSettings } from "@/types";
import { colors, fontSize, radius, spacing } from "@/theme";

const LANGUAGES = [
  { code: "zh-CN", label: "中文（普通话）" },
  { code: "en-US", label: "English (US)" },
  { code: "ja-JP", label: "日本語" },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);

  useEffect(() => {
    loadTtsSettings().then(setSettings);
  }, []);

  function update(patch: Partial<TtsSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveTtsSettings(next);
  }

  function preview(next: TtsSettings) {
    Speech.stop();
    Speech.speak("这是当前朗读设置的试听效果。", {
      language: next.language,
      rate: next.rate,
      pitch: next.pitch,
    });
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 账户 */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>账户</Text>
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{user?.name ?? "我的账户"}</Text>
            <Text style={styles.accountEmail}>{user?.email}</Text>
          </View>
        </View>
        <AppButton title="升级订阅" variant="outline" onPress={() => Alert.alert("订阅", "订阅功能开发中。")} />
        <AppButton
          title="登出"
          variant="ghost"
          onPress={handleSignOut}
          style={{ marginTop: spacing.xs }}
        />
      </Card>

      {/* 朗读语言 */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>朗读语言</Text>
        {LANGUAGES.map((lang) => {
          const active = settings.language === lang.code;
          return (
            <Pressable
              key={lang.code}
              onPress={() => update({ language: lang.code })}
              style={[styles.langRow, active && styles.langRowActive]}
            >
              <Text style={[styles.langLabel, active && { color: colors.primary, fontWeight: "700" }]}>
                {lang.label}
              </Text>
              {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </Card>

      {/* 语速 / 音调 */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>朗读效果</Text>
        <Stepper
          label="语速"
          value={settings.rate}
          onChange={(v) => update({ rate: clamp(v, 0.5, 2, 0.1) })}
        />
        <Stepper
          label="音调"
          value={settings.pitch}
          onChange={(v) => update({ pitch: clamp(v, 0.5, 2, 0.1) })}
        />
        <AppButton
          title="试听当前效果"
          variant="outline"
          onPress={() => preview(settings)}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <Text style={styles.footer}>轻听 EasyListen · v0.1.0</Text>
    </ScrollView>
  );
}

function clamp(v: number, min: number, max: number, step: number) {
  const rounded = Math.round(v / step) * step;
  return Math.min(max, Math.max(min, parseFloat(rounded.toFixed(2))));
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable style={styles.stepBtn} onPress={() => onChange(value - 0.1)}>
          <Ionicons name="remove" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.stepperValue}>{value.toFixed(1)}x</Text>
        <Pressable style={styles.stepBtn} onPress={() => onChange(value + 0.1)}>
          <Ionicons name="add" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  accountRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.iconBg,
    alignItems: "center",
    justifyContent: "center",
  },
  accountName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  accountEmail: { fontSize: fontSize.sm, color: colors.textMuted },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  langRowActive: { backgroundColor: colors.iconBg },
  langLabel: { fontSize: fontSize.md, color: colors.text },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  stepperLabel: { fontSize: fontSize.md, color: colors.text },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: { fontSize: fontSize.md, fontWeight: "600", color: colors.text, width: 44, textAlign: "center" },
  footer: { textAlign: "center", color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md },
});
