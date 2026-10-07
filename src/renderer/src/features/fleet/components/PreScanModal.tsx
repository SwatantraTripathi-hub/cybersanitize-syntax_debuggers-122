import React from 'react'
import { CheckCircle2, AlertTriangle, X, Shield, FileText, Database, HardDrive, ArrowRight } from 'lucide-react'
import { FleetNode } from '../../../context/CaseContext'

interface PreScanModalProps {
  isOpen: boolean
  onClose: () => void
  nodes: FleetNode[]
  onProceedWipe?: () => void
}

export const PreScanModal: React.FC<PreScanModalProps> = ({
  isOpen,
  onClose,
  nodes,
  onProceedWipe
}) => {
  if (!isOpen) return null

  const selectedNodes = nodes.filter(n => n.selected)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] text-atlas-text">
        <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-atlas-navy">
                Pre-Sanitization Storage Scan
              </h3>
              <p className="text-xs text-atlas-muted">
                Storage profile across {selectedNodes.length} selected workstations
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-atlas-muted hover:text-atlas-navy p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
            Scan complete. Review discovered file categories below before sanitizing.
          </div>

          <div className="space-y-3">
            {selectedNodes.map((node) => (
              <div key={node.id} className="p-4 rounded-xl border border-atlas-border bg-atlas-bg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-atlas-navy">{node.model}</span>
                    <span className="font-mono text-[11px] text-atlas-forest bg-white px-2 py-0.5 rounded border border-atlas-border">
                      {node.hostname} ({node.ip})
                    </span>
                  </div>
                  <span className="font-mono font-bold text-atlas-navy">{node.storage}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                  <div className="bg-white p-2 rounded border border-atlas-border">
                    <span className="text-atlas-muted block text-[9px]">Total Items:</span>
                    <strong className="text-atlas-forest">{node.preScanFindings ? node.preScanFindings.filesFound.toLocaleString() : '3,840'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-atlas-border">
                    <span className="text-atlas-muted block text-[9px]">Documents:</span>
                    <strong className="text-atlas-navy">{node.preScanFindings ? node.preScanFindings.docs : '920'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-atlas-border">
                    <span className="text-atlas-muted block text-[9px]">Media Files:</span>
                    <strong className="text-atlas-navy">{node.preScanFindings ? node.preScanFindings.media : '2,600'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-atlas-border">
                    <span className="text-atlas-muted block text-[9px]">Entropy:</span>
                    <strong className="text-amber-700">{node.preScanFindings ? node.preScanFindings.entropy.toFixed(2) : '7.42'}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-atlas-border bg-atlas-bg flex items-center justify-end gap-2">
          <button onClick={onClose} className="atlas-btn-secondary px-4 py-2 text-xs font-semibold">
            Close
          </button>
          {onProceedWipe && (
            <button
              onClick={() => {
                onClose()
                onProceedWipe()
              }}
              className="atlas-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <span>Proceed to Batch Wipe</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PreScanModal
