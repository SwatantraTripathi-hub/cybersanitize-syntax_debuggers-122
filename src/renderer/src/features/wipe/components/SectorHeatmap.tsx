import React, { useEffect, useRef } from 'react'
import { Activity } from 'lucide-react'

interface SectorHeatmapProps {
  progress: number // 0 to 100
  isWiping?: boolean
  standard?: string
}

export const SectorHeatmap: React.FC<SectorHeatmapProps> = ({
  progress = 0,
  isWiping = false,
  standard = 'nist-clear'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cols = 40
    const rows = 25
    const totalBlocks = cols * rows
    const completedBlocks = Math.floor((progress / 100) * totalBlocks)

    const blockWidth = canvas.width / cols
    const blockHeight = canvas.height / rows

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < totalBlocks; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = col * blockWidth
      const y = row * blockHeight

      if (i < completedBlocks) {
        // Sanitized color
        ctx.fillStyle = standard === 'nist-clear' ? '#10b981' : '#06b6d4'
      } else if (i === completedBlocks && isWiping) {
        // Current active writing head
        ctx.fillStyle = '#f59e0b'
      } else {
        // Untouched sector
        ctx.fillStyle = '#1e293b'
      }

      ctx.fillRect(x + 1, y + 1, blockWidth - 2, blockHeight - 2)
    }
  }, [progress, isWiping, standard])

  return (
    <div className="bg-atlas-card border border-atlas-border rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-semibold text-white tracking-wider uppercase font-mono">
            Sector Matrix Real-Time Heatmap
          </h4>
        </div>
        <span className="text-xs font-mono text-atlas-muted">
          {progress}% Sanitized (1,000 Sample Sectors)
        </span>
      </div>

      <div className="rounded-lg overflow-hidden border border-atlas-navy/80 bg-slate-950 p-1">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-36 block"
        />
      </div>

      <div className="flex items-center justify-between mt-3 text-[11px] text-atlas-muted font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-slate-800 rounded-sm inline-block" /> Unwritten
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm inline-block" /> Writing Head
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" /> Overwritten
          </span>
        </div>
        <span>60 FPS Hardware Direct Stream</span>
      </div>
    </div>
  )
}

export default SectorHeatmap
