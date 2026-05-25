type HapticImpact = 'light' | 'medium' | 'heavy'
type HapticNotification = 'success' | 'error' | 'warning'

interface TgWebApp {
  HapticFeedback?: {
    impactOccurred: (style: HapticImpact) => void
    notificationOccurred: (type: HapticNotification) => void
    selectionChanged: () => void
  }
  BackButton?: {
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
  }
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  enableClosingConfirmation?: () => void
  ready?: () => void
  expand?: () => void
  close?: () => void
  initDataUnsafe?: {
    user?: { id?: number; username?: string; first_name?: string; last_name?: string; photo_url?: string; language_code?: string }
    start_param?: string
  }
}

function getTg(): TgWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp
}

export function useTelegram() {
  const haptic = (type: HapticImpact | HapticNotification = 'light') => {
    try {
      const tg = getTg()
      if (!tg?.HapticFeedback) return
      if (type === 'success' || type === 'error' || type === 'warning') {
        tg.HapticFeedback.notificationOccurred(type)
      } else {
        tg.HapticFeedback.impactOccurred(type)
      }
    } catch {
      /* ignore — running outside Telegram */
    }
  }

  const init = () => {
    try {
      const tg = getTg()
      tg?.ready?.()
      tg?.expand?.()
      tg?.setHeaderColor?.('#050510')
      tg?.setBackgroundColor?.('#050510')

      const applyTgTop = () => {
        const r = getTg() as Record<string, unknown> | undefined
        if (!r) return
        const csa = r.contentSafeAreaInset as { top?: number } | undefined
        const sai = r.safeAreaInset as { top?: number } | undefined
        const top = (csa?.top ?? 0) + (sai?.top ?? 0)
        const val = top > 0 ? top : 56
        document.documentElement.style.setProperty('--tg-top', `${val}px`)
      }

      applyTgTop()

      const onSafeArea = () => applyTgTop()
      try { (tg as any).onEvent?.('contentSafeAreaChanged', onSafeArea) } catch {}
      try { (tg as any).onEvent?.('safeAreaChanged', onSafeArea) } catch {}

      setTimeout(applyTgTop, 300)
    } catch {
      /* ignore */
    }
  }

  const showBackButton = (cb: () => void) => {
    try {
      const tg = getTg()
      tg?.BackButton?.show()
      tg?.BackButton?.onClick(cb)
      return () => {
        try {
          tg?.BackButton?.offClick(cb)
          tg?.BackButton?.hide()
        } catch { /* ignore */ }
      }
    } catch {
      return () => { /* noop */ }
    }
  }

  return { haptic, init, showBackButton, tg: getTg() }
}
