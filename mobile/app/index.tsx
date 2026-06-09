import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme";

// 入口路由：根据登录态决定跳转，对应原 Web 端 middleware 的鉴权重定向。
export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return status === "authenticated" ? (
    <Redirect href="/(tabs)" />
  ) : (
    <Redirect href="/sign-in" />
  );
}
