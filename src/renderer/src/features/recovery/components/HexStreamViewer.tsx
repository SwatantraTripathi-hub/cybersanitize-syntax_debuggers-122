import React from 'react'
import { Terminal, X } from 'lucide-react'

interface HexStreamViewerProps {
  fileName?: string
  sectorOffset?: number
  fileSize?: number
  onClose?: () => void
  currentOffset?: number
  hexLines?: string[]
  isScanning?: boolean
}

export const HexStreamViewer: React.FC<HexStreamViewerProps> = ({
  fileName,
  sectorOffset = 0,
  fileSize,
  onClose,
  currentOffset = 0,
  hexLines = [
    '00000000  FF D8 FF E0 00 10 4A 46  49 46 00 01 01 01 00 48  |......JFIF.....H|',
    '00000010  00 48 00 00 FF DB 00 43  00 03 02 02 03 02 02 03  |.H.....C........|',
    '00000020  03 03 04 03 03 04 05 08  05 05 04 04 05 0A 07 07  |................|',
    '00000030  06 08 0C 0A 0C 0C 0B 0A  0B 0B 0D 0E 12 10 0D 0E  |................|'
  ],
  isScanning = false
}) => {
  const content = (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono shadow-xl text-xs w-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Terminal className="w-3.5 h-3.5" />
          <span className="font-bold uppercase tracking-wider">
            {fileName ? `Hex Viewer: ${fileName}` : 'Sector Hex Stream'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">
            Offset: 0x{(sectorOffset || currentOffset).toString(16).toUpperCase().padStart(8, '0')}
          </span>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900/80 rounded p-3 text-[11px] text-emerald-300 leading-relaxed font-mono overflow-x-auto select-all">
        {hexLines.map((line, idx) => (
          <div key={idx} className="hover:bg-emerald-500/10 px-1 rounded transition-colors">
            {line}
          </div>
        ))}
      </div>
    </div>
  )

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <div className="max-w-2xl w-full">
          {content}
        </div>
      </div>
    )
  }

  return content
}

export default HexStreamViewer
