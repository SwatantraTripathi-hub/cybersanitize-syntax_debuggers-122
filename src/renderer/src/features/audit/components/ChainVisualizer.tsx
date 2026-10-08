import React from 'react'
import { Link2, ShieldCheck, AlertTriangle } from 'lucide-react'

export interface ChainBlock {
  id: number
  operation: string
  timestamp: string
  prevHash: string
  hash: string
  isValid: boolean
}

interface ChainVisualizerProps {
  blocks?: ChainBlock[]
  isChainValid?: boolean
}

export const ChainVisualizer: React.FC<ChainVisualizerProps> = ({
  blocks = [
    { id: 1, operation: 'CASE_GENESIS', timestamp: '10:00:00 UTC', prevHash: 'GENESIS', hash: '8f92a10b...', isValid: true },
    { id: 2, operation: 'DRIVE_CARVE', timestamp: '10:02:15 UTC', prevHash: '8f92a10b...', hash: '3e41b7cd...', isValid: true },
    { id: 3, operation: 'NIST_WIPE', timestamp: '10:05:40 UTC', prevHash: '3e41b7cd...', hash: '99a4c11e...', isValid: true }
  ],
  isChainValid = true
}) => {
  return (
    <div className="bg-atlas-card border border-atlas-border rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4 border-b border-atlas-navy/80 pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-emerald-400" />
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wide uppercase">
              Cryptographic Hash Chain Visualizer (Phase 2)
            </h4>
            <p className="text-xs text-atlas-muted">
              SHA-256 forward-linked immutable ledger. Retroactive alterations break the chain.
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold ${isChainValid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {isChainValid ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>CHAIN INTACT</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>CHAIN TAMPERED</span>
            </>
          )}
        </div>
      </div>

      {/* Horizontal Scrolling Blocks */}
      <div className="flex items-center gap-2 overflow-x-auto py-3 px-1 scrollbar-thin">
        {blocks.map((block, index) => (
          <React.Fragment key={block.id}>
            <div className={`shrink-0 w-52 p-3 rounded-lg border bg-slate-950 font-mono text-xs shadow ${block.isValid ? 'border-emerald-500/30 hover:border-emerald-500' : 'border-red-500/50 hover:border-red-500'} transition-all`}>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="font-bold text-white">BLOCK #{block.id}</span>
                <span className="text-atlas-muted text-[10px]">{block.timestamp}</span>
              </div>
              <div className="text-emerald-400 font-bold mb-2 truncate">
                {block.operation}
              </div>
              <div className="space-y-1 text-[10px] text-slate-400 bg-slate-900/90 p-1.5 rounded">
                <div className="truncate"><span className="text-slate-500">prev:</span> {block.prevHash}</div>
                <div className="truncate"><span className="text-slate-500">hash:</span> {block.hash}</div>
              </div>
            </div>

            {index < blocks.length - 1 && (
              <div className="shrink-0 flex items-center text-emerald-500/60">
                <div className="w-6 h-0.5 bg-emerald-500/40"></div>
                <div className="text-[10px] -ml-1">▶</div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export default ChainVisualizer
