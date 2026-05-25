import crypto from "node:crypto";
import { ENV } from "./env.js";

const ADMIN_SALT = "fanvue:admin:v1:";
const TG_API = `https://api.telegram.org/bot${ENV.botToken}`;

// ── Telegram initData HMAC-SHA256 verification ──────────────────────
// See https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export function verifyInitData(initData: string): TelegramUser | null {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    params.delete("hash");
    const pairs = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(ENV.botToken)
      .digest();

    const computed = crypto
      .createHmac("sha256", secretKey)
      .update(pairs)
      .digest("hex");

    if (computed !== hash) return null;

    const userStr = params.get("user");
    if (!userStr) return null;
    return JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
}

// ── Admin hash verification (server-side, same algo as client) ──────

export function computeAdminHash(uid: number): string {
  return crypto
    .createHash("sha256")
    .update(`${ADMIN_SALT}${uid}`)
    .digest("hex");
}

export function isAdmin(uid: number): boolean {
  const hash = computeAdminHash(uid);
  return ENV.adminHashes.some((h) => h === hash);
}

// ── Telegram Bot API: send messages ─────────────────────────────────

export async function sendMessage(
  chatId: number | string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML",
): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  } catch (e) {
    console.error("[telegram] sendMessage error:", e);
    return false;
  }
}

export async function notifyAdmin(text: string): Promise<boolean> {
  return sendMessage(ENV.adminChatId, text);
}

export async function notifyUser(
  chatId: number,
  text: string,
): Promise<boolean> {
  return sendMessage(chatId, text);
}
