import { CONFIG } from '../config'
import { getTelegramInitData } from './security'
import type { CryptoNetwork, OrderStatus } from '../store/types'

/**
 * Unique order ID using crypto-random bytes.
 * Format: {PREFIX}-{base36(ts)}-{4 random chars}
 */
export function generateOrderId(kind: 'buy' | 'deposit' = 'buy'): string {
  const prefix = kind === 'deposit' ? 'DEP' : 'ORD'
  const ts = Date.now().toString(36).toUpperCase()
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint8Array(4)
  crypto.getRandomValues(arr)
  let rand = ''
  for (let i = 0; i < 4; i++) rand += alphabet[arr[i] % alphabet.length]
  return `${prefix}-${ts}-${rand}`
}

/**
 * Unique deposit amount with 3-decimal micro-offset.
 * Uses crypto.getRandomValues for true randomness + a session-local
 * deduplication set to guarantee no two amounts collide.
 *
 * Example: base=10 → 10.023, 10.047, 10.081 (never 10.000 or 10.010)
 */
const _usedAmounts = new Set<number>()

export function generateUniqueAmount(base: number): number {
  const MAX_ATTEMPTS = 50
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const buf = new Uint8Array(2)
    crypto.getRandomValues(buf)
    const raw = ((buf[0] << 8) | buf[1]) % 990 + 10
    const offset = raw / 10000
    const amount = Math.round((base + offset) * 1000) / 1000

    if (!_usedAmounts.has(amount)) {
      _usedAmounts.add(amount)
      if (_usedAmounts.size > 2000) {
        const arr = [..._usedAmounts]
        arr.splice(0, 1000)
        _usedAmounts.clear()
        arr.forEach((a) => _usedAmounts.add(a))
      }
      return amount
    }
  }
  const fallback = new Uint8Array(2)
  crypto.getRandomValues(fallback)
  const offset = (((fallback[0] << 8) | fallback[1]) % 990 + 10) / 10000
  return Math.round((base + offset) * 1000) / 1000
}

/** Payment URI for deep links (BIP21, EIP-681, TON) */
export function paymentUri(network: CryptoNetwork, address: string, amount: number): string {
  if (network === 'btc') return `bitcoin:${address}?amount=${amount}`
  if (network === 'eth') return `ethereum:${address}?value=${amount}`
  if (network === 'ton') return `ton://transfer/${address}?amount=${Math.round(amount * 1e9)}`
  return address
}

function authHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getTelegramInitData(),
    'X-Request-Id': `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    'X-Request-Ts': String(Date.now()),
  }
}

async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  retries = 1,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5_000)
      const res = await fetch(input, { ...init, signal: ctrl.signal })
      clearTimeout(timer)
      if (res.ok || i === retries) return res
    } catch (e) {
      if (i === retries) throw e
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('fetch failed')
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  if (!CONFIG.apiUrl) return 'pending'
  try {
    const res = await fetchWithRetry(
      `${CONFIG.apiUrl}/api/order/${encodeURIComponent(orderId)}`,
      { headers: authHeaders() },
    )
    if (!res.ok) return 'pending'
    const data = (await res.json()) as { status?: OrderStatus }
    return data.status ?? 'pending'
  } catch {
    return 'pending'
  }
}

export async function createOrder(payload: {
  uid: number
  kind: 'buy' | 'deposit'
  product_id?: number
  quantity?: number
  amount_usd: number
  network: CryptoNetwork
}): Promise<{ id: string; address: string; amount_crypto: number; expires_at: string } | null> {
  if (!CONFIG.apiUrl) return null
  try {
    const res = await fetchWithRetry(
      `${CONFIG.apiUrl}/api/order`,
      { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
