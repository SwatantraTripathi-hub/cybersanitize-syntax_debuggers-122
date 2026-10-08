import React from 'react'
import { Terminal } from 'lucide-react'

interface HexStreamViewerProps {
  currentOffset?: number
  hexLines?: string[]
  isScanning?: boolean
}

export const HexStreamViewer: React.FC<HexStreamViewerProps> = ({
  currentOffset = 0,
  hexLines = [
    '00000000  FF D8 FF E0 00 10 4A 46  49 46 00 01 01 01 00 48  |......JFIF.....H|',
    '00000010  00 48 00 00 FF DB 00 43  00 03 02 02 03 02 02 03  |.H.....C........|',
    '00000020  03 03 04 03 03 04 05 08  05 05 04 04 05 0A 07 07  |................|',
    '00000030  06 08 0C 0A 0C 0C 0B 0A  0B 0B 0D 0E 12 10 0D 0E  |................|'
  ],
  isScanning = false
}) => {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2 text-emerald-400 text-xs">
          <Terminal className="w-3.5 h-3.5" />
          <span className="font-bold uppercase tracking-wider">Raw Sector Hex Stream (Direct DMA)</span>
        </div>
        <div className="flex items-center gap-2">
          {isScanning && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
          <span className="text-[11px] text-slate-400">
            Offset: 0x{currentOffset.toString(16).toUpperCase().padStart(8, '0')}
          </span>
        </div>
      </div>

      <div className="bg-slate-900/80 rounded p-3 text-[11px] text-emerald-300/90 leading-relaxed font-mono overflow-x-auto select-all">
        {hexLines.map((line, idx) => (
          <div key={idx} className="hover:bg-emerald-500/10 px-1 rounded transition-colors">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

export default HexStreamViewer
