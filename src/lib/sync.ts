/**
 * 偏好云同步(匿名,无账号):iOS Safari 会清掉七天未访问站点的
 * localStorage,兴趣与收听记录会蒸发。这里用"设备匿名 ID + Supabase"
 * 把偏好悄悄备份到云端,回访时若本地为空则拉回。
 *
 * 休眠开关:未配置 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (在 Vercel 项目环境变量里设,构建时注入)时本模块完全不工作。
 * 建表与策略见 docs/prefs-sync.md。anon key 按 Supabase 设计即公开凭据,
 * 数据面由 RLS 约束;同步内容仅为兴趣标签与收听进度,无隐私敏感信息。
 */

import type { Prefs } from "./prefs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const syncEnabled = Boolean(URL && KEY);

const DEVICE_KEY = "easylisten.device";

function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

const HEADERS = {
  apikey: KEY ?? "",
  authorization: `Bearer ${KEY}`,
  "content-type": "application/json",
};

let timer: ReturnType<typeof setTimeout> | undefined;

/** 防抖上推:偏好每次落盘后 3 秒内合并为一次网络写,失败静默。 */
export function schedulePush(prefs: Prefs) {
  if (!syncEnabled || typeof window === "undefined") return;
  const id = deviceId();
  if (!id) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void fetch(`${URL}/rest/v1/prefs`, {
      method: "POST",
      headers: { ...HEADERS, prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([
        { device_id: id, data: prefs, updated_at: new Date().toISOString() },
      ]),
    }).catch(() => {});
  }, 3000);
}

/**
 * 回访恢复:仅当本地是"白纸"(未做过兴趣引导)而云端有备份时,
 * 把云端偏好写回本地。返回是否发生了恢复,调用方据此刷新界面状态。
 */
export async function restorePrefs(
  localOnboarded: boolean,
  write: (prefs: Prefs) => void,
): Promise<boolean> {
  if (!syncEnabled || typeof window === "undefined" || localOnboarded) return false;
  const id = deviceId();
  if (!id) return false;
  try {
    const res = await fetch(
      `${URL}/rest/v1/prefs?device_id=eq.${id}&select=data`,
      { headers: HEADERS },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ data: Prefs }>;
    const remote = rows[0]?.data;
    if (remote?.onboarded) {
      write(remote);
      return true;
    }
  } catch {
    // 网络失败静默:同步是锦上添花,不打扰使用
  }
  return false;
}
