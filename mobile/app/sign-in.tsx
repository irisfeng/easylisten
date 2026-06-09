import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { AppButton, Card } from "@/components/ui";
import { colors, fontSize, radius, spacing } from "@/theme";

// 登录页，复刻 Web 端 src/app/(auth)/sign-in/page.tsx。
export default function SignInScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const ok = await signIn(email, password);
    setLoading(false);
    if (ok) {
      router.replace("/(tabs)");
    } else {
      setError("邮箱或密码不正确");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Card style={styles.card}>
        <View style={styles.brand}>
          <Ionicons name="book" size={32} color={colors.primary} />
          <Text style={styles.brandText}>轻听</Text>
        </View>
        <Text style={styles.title}>欢迎回来</Text>
        <Text style={styles.subtitle}>输入您的凭据以访问您的账户</Text>

        <View style={styles.field}>
          <Text style={styles.label}>邮箱</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="m@example.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>密码</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <AppButton
          title="安全登录"
          onPress={handleSignIn}
          loading={loading}
          style={{ marginTop: spacing.md }}
        />

        <Text style={styles.hint}>测试账号：test@example.com / password</Text>
      </Card>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  card: { padding: spacing.lg, gap: spacing.sm },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  brandText: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.text },
  title: { fontSize: fontSize.xl, fontWeight: "700", textAlign: "center", marginTop: spacing.md, color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center", marginBottom: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.card,
  },
  error: { color: colors.error, fontSize: fontSize.sm, textAlign: "center" },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
});
