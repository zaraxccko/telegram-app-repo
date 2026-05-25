import { Router, type Request, type Response } from "express";
import { verifyInitData, notifyAdmin, notifyUser } from "../telegram.js";

const router = Router();

router.post("/api/notify", (req: Request, res: Response) => {
  const initData =
    (req.headers["x-telegram-init-data"] as string) || req.body?.initData || "";

  const user = verifyInitData(initData);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { text, chatId } = req.body as { text?: string; chatId?: number };
  if (!text) {
    res.status(400).json({ error: "Missing text" });
    return;
  }

  if (chatId) {
    notifyUser(chatId, text);
  } else {
    notifyAdmin(text);
  }

  res.json({ ok: true });
});

export default router;
