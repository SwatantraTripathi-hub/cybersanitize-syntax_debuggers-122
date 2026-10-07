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
    { id: 1, operation: 'WORKSPACE_GENESIS', timestamp: '10:00:00 UTC', prevHash: '00000000...', hash: '8f92a10b...', isValid: true },
    { id: 2, operation: 'STORAGE_PROBE', timestamp: '10:02:15 UTC', prevHash: '8f92a10b...', hash: '3e41b7cd...', isValid: true },
    { id: 3, operation: 'DRIVE_SANITIZATION', timestamp: '10:05:40 UTC', prevHash: '3e41b7cd...', hash: '99a4c11e...', isValid: true },
    { id: 4, operation: 'DATA_RECOVERY', timestamp: '10:08:12 UTC', prevHash: '99a4c11e...', hash: 'e9a2c5f6...', isValid: true },
    { id: 5, operation: 'CERTIFICATE_SEAL', timestamp: '10:10:00 UTC', prevHash: 'e9a2c5f6...', hash: '4f1a2b3c...', isValid: true }
  ],
  isChainValid = true
}) => {
  return (
    <div className="bg-white border border-atlas-border rounded-xl p-5 shadow-atlas space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-atlas-border pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-atlas-forest" />
          <div>
            <h4 className="text-sm font-bold text-atlas-navy tracking-wide uppercase">
              Audit Chain Visualizer
            </h4>
            <p className="text-xs text-atlas-muted">
              Cryptographically linked sequence of ledger blocks
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold ${
          isChainValid
            ? 'bg-atlas-lightgreen text-atlas-forest border border-atlas-bordergreen'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
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

      {/* Block conveyor */}
      <div className="flex items-center gap-3 overflow-x-auto py-2">
        {blocks.map((block, idx) => (
          <React.Fragment key={block.id}>
            <div className="bg-atlas-bg border border-atlas-border rounded-xl p-3.5 min-w-[200px] shrink-0 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-atlas-forest">#{block.id}</span>
                <span className="text-[10px] text-atlas-muted font-mono">{block.timestamp}</span>
              </div>
              <div className="font-bold text-atlas-navy truncate">{block.operation}</div>
              <div className="font-mono text-[10px] text-atlas-muted space-y-0.5 pt-1 border-t border-atlas-border">
                <div>Prev: {block.prevHash}</div>
                <div>Hash: {block.hash}</div>
              </div>
            </div>

            {idx < blocks.length - 1 && (
              <div className="text-atlas-muted shrink-0">→</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export default ChainVisualizer
