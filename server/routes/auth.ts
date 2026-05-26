import { Router, type Request, type Response } from "express";
import { verifyInitData, isAdmin } from "../telegram.js";
import { users } from "../db.js";

const router = Router();

router.post("/api/auth", (req: Request, res: Response) => {
  const initData =
    (req.headers["x-telegram-init-data"] as string) || req.body?.initData || "";

  const user = verifyInitData(initData);
  if (!user) {
    res.status(401).json({ error: "Invalid Telegram initData" });
    return;
  }

  const row = users.upsert({
    uid: user.id,
    username: user.username ?? null,
    full_name: [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
  });

  res.json({
    uid: user.id,
    first_name: user.first_name,
    last_name: user.last_name ?? "",
    username: user.username ?? "",
    photo_url: user.photo_url ?? "",
    language_code: user.language_code ?? "en",
    isAdmin: isAdmin(user.id),
    balance: row.balance,
    spent: row.spent,
    purchases: row.purchases,
    ref_earned: row.ref_earned,
    ref_count: row.ref_count,
    ref_balance: row.ref_balance,
  });
});

export default router;
