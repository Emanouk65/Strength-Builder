import { type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { sheetMotion, overlayMotion } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  /** Disable the swipe-to-close drag. Default: false. */
  noDrag?: boolean
  /** When true the Sheet renders without internal padding or scroll container —
   *  children handle their own layout. Useful for pinned headers. */
  noPadding?: boolean
}

export function Sheet({ open, onClose, title, children, className, noDrag, noPadding }: SheetProps) {
  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // ESC to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Track the visual viewport so the sheet rises above the on-screen keyboard.
  // iOS Safari does NOT shrink vh/dvh when the keyboard opens, so without this
  // the sheet's bottom (and its scrollable content) ends up under the keyboard.
  const [vv, setVv] = useState<{ height: number; offsetTop: number } | null>(null)
  useEffect(() => {
    if (!open) { setVv(null); return }
    const visual = typeof window !== 'undefined' ? window.visualViewport : null
    if (!visual) return
    const update = () => setVv({ height: visual.height, offsetTop: visual.offsetTop })
    update()
    visual.addEventListener('resize', update)
    visual.addEventListener('scroll', update)
    return () => {
      visual.removeEventListener('resize', update)
      visual.removeEventListener('scroll', update)
    }
  }, [open])

  // Keyboard offset = how far the layout viewport bottom sits below the visible
  // viewport bottom. When keyboard is closed this is ~0.
  const keyboardOffset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
  const sheetMaxH = vv ? vv.height * 0.92 : null

  const outerStyle: React.CSSProperties = {}
  if (sheetMaxH != null) outerStyle.maxHeight = sheetMaxH
  if (keyboardOffset > 0) outerStyle.bottom = keyboardOffset

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            {...overlayMotion}
          />
          <motion.div
            className={cn(
              'fixed inset-x-0 bottom-0 z-[70] overflow-hidden',
              'rounded-t-3xl border-t border-border/60 bg-card',
              'shadow-[0_-12px_40px_rgba(0,0,0,0.55)]',
              'safe-area-bottom',
              // Fallback height when the visualViewport API isn't available
              // (most desktop browsers). Inline maxHeight overrides this when set.
              sheetMaxH == null && 'max-h-[92dvh]',
              className
            )}
            style={outerStyle}
            {...sheetMotion}
            drag={noDrag ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose()
            }}
          >
            <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-border" />
            {noPadding ? (
              children
            ) : (
              <>
                {title && (
                  <div className="px-5 pt-3 pb-2">
                    <h2 className="text-base font-semibold text-foreground">{title}</h2>
                  </div>
                )}
                <div
                  className="px-5 pb-5 overflow-y-auto"
                  style={{
                    maxHeight: sheetMaxH != null ? sheetMaxH - 60 : undefined,
                  }}
                >
                  {children}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
