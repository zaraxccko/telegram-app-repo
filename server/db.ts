import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "..", "data", "orders.db");

import fs from "node:fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH, { verbose: undefined });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,
    uid           INTEGER NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'deposit',
    amount_usd    REAL NOT NULL,
    amount_crypto REAL NOT NULL,
    network       TEXT NOT NULL,
    wallet        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    tx_hash       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at    TEXT NOT NULL,
    paid_at       TEXT,
    completed_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_network ON orders(network, status);
  CREATE INDEX IF NOT EXISTS idx_orders_uid ON orders(uid);

  CREATE TABLE IF NOT EXISTS transactions (
    tx_hash   TEXT PRIMARY KEY,
    network   TEXT NOT NULL,
    from_addr TEXT,
    to_addr   TEXT NOT NULL,
    amount    REAL NOT NULL,
    token     TEXT,
    block     INTEGER,
    ts        TEXT NOT NULL,
    order_id  TEXT REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tx_order ON transactions(order_id);
`);

export interface OrderRow {
  id: string;
  uid: number;
  kind: string;
  amount_usd: number;
  amount_crypto: number;
  network: string;
  wallet: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  completed_at: string | null;
}

const stmts = {
  insertOrder: db.prepare(`
    INSERT INTO orders (id, uid, kind, amount_usd, amount_crypto, network, wallet, status, expires_at)
    VALUES (@id, @uid, @kind, @amount_usd, @amount_crypto, @network, @wallet, 'pending', @expires_at)
  `),
  getOrder: db.prepare(`SELECT * FROM orders WHERE id = ?`),
  getOrdersByUid: db.prepare(`SELECT * FROM orders WHERE uid = ? ORDER BY created_at DESC LIMIT 50`),
  getPending: db.prepare(`SELECT * FROM orders WHERE status = 'pending' AND network = ?`),
  getAllPending: db.prepare(`SELECT * FROM orders WHERE status = 'pending'`),
  updateStatus: db.prepare(`UPDATE orders SET status = @status WHERE id = @id`),
  markPaid: db.prepare(`
    UPDATE orders SET status = 'paid', tx_hash = @tx_hash, paid_at = datetime('now')
    WHERE id = @id AND status = 'pending'
  `),
  markCompleted: db.prepare(`
    UPDATE orders SET status = 'completed', completed_at = datetime('now')
    WHERE id = @id AND status = 'paid'
  `),
  expireOld: db.prepare(`
    UPDATE orders SET status = 'expired'
    WHERE status = 'pending' AND expires_at < datetime('now')
  `),
  insertTx: db.prepare(`
    INSERT OR IGNORE INTO transactions (tx_hash, network, from_addr, to_addr, amount, token, block, ts, order_id)
    VALUES (@tx_hash, @network, @from_addr, @to_addr, @amount, @token, @block, @ts, @order_id)
  `),
  getTxByHash: db.prepare(`SELECT * FROM transactions WHERE tx_hash = ?`),
};

export const orders = {
  create(o: {
    id: string;
    uid: number;
    kind: string;
    amount_usd: number;
    amount_crypto: number;
    network: string;
    wallet: string;
    expires_at: string;
  }) {
    stmts.insertOrder.run(o);
  },
  get(id: string): OrderRow | undefined {
    return stmts.getOrder.get(id) as OrderRow | undefined;
  },
  getByUid(uid: number): OrderRow[] {
    return stmts.getOrdersByUid.all(uid) as OrderRow[];
  },
  getPending(network: string): OrderRow[] {
    return stmts.getPending.all(network) as OrderRow[];
  },
  getAllPending(): OrderRow[] {
    return stmts.getAllPending.all() as OrderRow[];
  },
  markPaid(id: string, txHash: string) {
    stmts.markPaid.run({ id, tx_hash: txHash });
  },
  markCompleted(id: string) {
    stmts.markCompleted.run({ id });
  },
  expire(id: string) {
    stmts.updateStatus.run({ id, status: "expired" });
  },
  expireOld() {
    return stmts.expireOld.run();
  },
};

export const transactions = {
  insert(tx: {
    tx_hash: string;
    network: string;
    from_addr: string;
    to_addr: string;
    amount: number;
    token: string | null;
    block: number | null;
    ts: string;
    order_id: string | null;
  }) {
    stmts.insertTx.run(tx);
  },
  exists(hash: string): boolean {
    return !!stmts.getTxByHash.get(hash);
  },
};

export default db;
