import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./env.js";
import authRouter from "./routes/auth.js";
import ordersRouter from "./routes/orders.js";
import notifyRouter from "./routes/notify.js";
import { startPoller } from "./blockchain/poller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "..", "dist");

const app = express();

app.use(express.json());

// ── API routes ──────────────────────────────────────────────────────
app.use(authRouter);
app.use(ordersRouter);
app.use(notifyRouter);

// ── Health check ────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// ── Serve static SPA from dist/ ─────────────────────────────────────
app.use(
  express.static(DIST, {
    maxAge: "1y",
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }),
);

app.get("/{*splat}", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(DIST, "index.html"));
});

// ── Start ───────────────────────────────────────────────────────────
app.listen(ENV.port, () => {
  console.log(`\n  Server running on http://localhost:${ENV.port}`);
  console.log(`  Serving SPA from ${DIST}`);
  console.log(`  Admin hashes: ${ENV.adminHashes.length} configured`);

  const configuredNetworks = Object.entries(ENV.addr)
    .filter(([, v]) => !!v)
    .map(([k]) => k);
  console.log(`  Wallets configured: ${configuredNetworks.join(", ") || "none"}`);
  console.log();

  startPoller();
});
