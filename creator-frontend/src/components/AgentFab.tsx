import { useState, useRef, useCallback, useEffect } from 'react'

interface Position { x: number; y: number }

interface AgentFabProps {
  onOpen: () => void
}

export function AgentFab({ onOpen }: AgentFabProps) {
  const [pos, setPos] = useState<Position>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const startPos = useRef<Position>({ x: 0, y: 0 })
  const startMouse = useRef<Position>({ x: 0, y: 0 })
  const hasMoved = useRef(false)

  useEffect(() => {
    setPos({ x: window.innerWidth - 72, y: window.innerHeight - 160 })
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    hasMoved.current = false
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    startPos.current = { ...pos }
    startMouse.current = { x: clientX, y: clientY }
    setDragging(true)
  }, [pos])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const dx = clientX - startMouse.current.x
      const dy = clientY - startMouse.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 64, startPos.current.x + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 64, startPos.current.y + dy)),
      })
    }

    const onUp = () => {
      setDragging(false)
      if (!hasMoved.current) onOpen()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, onOpen])

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onMouseDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 4px 16px rgba(99,102,241,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: dragging ? 'none' : 'box-shadow 0.2s',
        color: '#fff',
        fontSize: 22,
        fontWeight: 700,
      }}
    >
      AG
    </div>
  )
}
