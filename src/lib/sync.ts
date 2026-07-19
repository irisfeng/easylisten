/**
 * 登录后的偏好同步：浏览器只访问轻听自己的同源 API，数据库凭据永不下发。
 * 未登录时所有偏好继续留在 localStorage，账号功能不阻断试听。
 */

import type { Prefs } from "./prefs";

let timer: ReturnType<typeof setTimeout> | undefined;

export function mergePrefs(local: Prefs, remote: Prefs | null): Prefs {
  if (!remote) return local;

  const listened = { ...remote.listened };
  for (const [slug, ratio] of Object.entries(local.listened)) {
    listened[slug] = Math.max(listened[slug] ?? 0, ratio);
  }

  const affinity = { ...remote.affinity };
  for (const [category, value] of Object.entries(local.affinity)) {
    const old = affinity[category as keyof typeof affinity];
    affinity[category as keyof typeof affinity] =
      typeof old === "number" ? (old + value) / 2 : value;
  }

  return {
    onboarded: local.onboarded || remote.onboarded,
    interests: [...new Set([...remote.interests, ...local.interests])],
    affinity,
    listened,
    favorites: [...new Set([...remote.favorites, ...local.favorites])],
    voiceURI: local.voiceURI ?? remote.voiceURI,
    voiceGender: local.voiceGender ?? remote.voiceGender,
  };
}
export function schedulePush(prefs: Prefs) {
  if (typeof window === "undefined") return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void fetch("/api/account/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: prefs }),
    }).catch(() => {});
  }, 3000);
}

/** 登录后合并本机与云端记录；未登录返回 null，不产生提示或中断。 */
export async function syncAccountPrefs(local: Prefs): Promise<Prefs | null> {
  try {
    const response = await fetch("/api/account/preferences", { cache: "no-store" });
    if (response.status === 401) return null;
    if (!response.ok) return null;
    const body = await response.json();
    const merged = mergePrefs(local, body.data ?? null);
    await fetch("/api/account/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: merged }),
    });
    return merged;
  } catch {
    return null;
  }
}
