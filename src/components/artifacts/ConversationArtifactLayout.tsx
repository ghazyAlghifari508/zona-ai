import {
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

export type ConversationArtifactLayoutProps = {
  canvasOpen: boolean
  chatPane: ReactNode
  canvasPane: ReactNode
}

const STORAGE_KEY = 'zona_canvas_width'
const DEFAULT_CANVAS_WIDTH = 550
const MIN_CANVAS_WIDTH = 360
const MAX_CANVAS_RATIO = 0.65
const MIN_CHAT_WIDTH = 360
const KEYBOARD_STEP = 20

function getInitialWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_CANVAS_WIDTH
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return DEFAULT_CANVAS_WIDTH
    const parsed = Number.parseInt(saved, 10)
    return Number.isFinite(parsed) && parsed >= MIN_CANVAS_WIDTH
      ? parsed
      : DEFAULT_CANVAS_WIDTH
  } catch {
    return DEFAULT_CANVAS_WIDTH
  }
}

function persistWidth(width: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, Math.round(width).toString())
  } catch {
    // Ignore localStorage quota or access errors
  }
}

export function ConversationArtifactLayout({
  canvasOpen,
  chatPane,
  canvasPane,
}: ConversationArtifactLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState<number>(getInitialWidth)
  const [isDragging, setIsDragging] = useState(false)
  const canvasWidthRef = useRef(canvasWidth)
  canvasWidthRef.current = canvasWidth

  const [isMounted, setIsMounted] = useState(canvasOpen)
  const [isExpanded, setIsExpanded] = useState(canvasOpen)
  const isInitialMount = useRef(true)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (canvasOpen) {
      setIsMounted(true)
      setIsExpanded(false)

      rafRef.current = requestAnimationFrame(() => {
        setIsExpanded(true)
      })
    } else {
      setIsExpanded(false)
      closeTimeoutRef.current = setTimeout(() => {
        setIsMounted(false)
      }, 190)
    }

    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [canvasOpen])

  const clampWidth = useCallback(
    (rawWidth: number, containerWidth?: number): number => {
      const measured = containerRef.current?.getBoundingClientRect().width
      const totalWidth =
        containerWidth ??
        (measured && measured > 0
          ? measured
          : typeof window !== 'undefined'
            ? window.innerWidth
            : 1200)
      const minWidth = MIN_CANVAS_WIDTH
      const maxAllowed = Math.max(
        minWidth,
        Math.min(
          totalWidth * MAX_CANVAS_RATIO,
          Math.max(minWidth, totalWidth - MIN_CHAT_WIDTH),
        ),
      )
      return Math.max(minWidth, Math.min(maxAllowed, rawWidth))
    },
    [],
  )

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const rawWidth = rect.right - e.clientX
      const clamped = clampWidth(rawWidth, rect.width)
      setCanvasWidth(clamped)
    }

    const handlePointerUp = () => {
      setIsDragging(false)
      persistWidth(canvasWidthRef.current)
    }

    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [isDragging, clampWidth])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = clampWidth(canvasWidth + KEYBOARD_STEP)
      setCanvasWidth(next)
      persistWidth(next)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = clampWidth(canvasWidth - KEYBOARD_STEP)
      setCanvasWidth(next)
      persistWidth(next)
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="conversation-artifact-layout"
      data-canvas-open={canvasOpen}
      className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <div
        data-testid="chat-pane"
        className={`relative h-full min-h-0 min-w-0 overflow-hidden flex-1 flex flex-col ${
          canvasOpen ? 'hidden md:flex' : 'flex'
        }`}
      >
        {chatPane}
      </div>

      {isMounted ? (
        /* biome-ignore lint/a11y/useSemanticElements: interactive resizable splitter requires role="separator" */
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ubah ukuran panel canvas"
          aria-valuenow={Math.round(canvasWidth)}
          aria-valuemin={MIN_CANVAS_WIDTH}
          tabIndex={0}
          data-testid="artifact-layout-separator"
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          className={`relative hidden md:flex items-center justify-center w-2 -mx-1 shrink-0 z-30 cursor-col-resize select-none touch-none group outline-none ${
            isDragging
              ? ''
              : isExpanded
                ? 'transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]'
                : 'transition-opacity duration-180 ease-[cubic-bezier(0.4,0,0.2,1)]'
          } ${isExpanded ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="h-full w-px bg-hairline group-hover:bg-hairline-strong group-active:bg-accent group-focus-visible:bg-accent transition-colors" />
        </div>
      ) : null}

      <div
        data-testid="canvas-pane"
        style={
          isMounted
            ? { width: isExpanded ? `${canvasWidth}px` : 0 }
            : { width: 0 }
        }
        className={`h-full min-h-0 min-w-0 overflow-hidden shrink-0 ${
          isMounted ? 'flex flex-col w-full md:w-auto' : 'hidden'
        } ${
          isDragging
            ? ''
            : isExpanded
              ? 'transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]'
              : 'transition-[width] duration-180 ease-[cubic-bezier(0.4,0,0.2,1)]'
        }`}
      >
        <div
          style={{ width: `${canvasWidth}px`, maxWidth: '100vw' }}
          className={`h-full min-h-0 flex flex-col shrink-0 ${
            isDragging
              ? ''
              : isExpanded
                ? 'transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]'
                : 'transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.4,0,0.2,1)]'
          } ${
            isExpanded
              ? 'translate-x-0 opacity-100'
              : 'translate-x-6 opacity-60'
          }`}
        >
          {canvasPane}
        </div>
      </div>
    </div>
  )
}
