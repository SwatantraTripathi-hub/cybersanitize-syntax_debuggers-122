import React, { useEffect, useState } from 'react'
import { Flame, X, AlertTriangle, ShieldCheck, Check } from 'lucide-react'

interface BatchTriggerModalProps {
  isOpen: boolean
  onClose: () => void
  selectedCount: number
  defaultStandard: string
  onConfirmWipe: (standard: string) => void
}

export const BatchTriggerModal: React.FC<BatchTriggerModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  defaultStandard,
  onConfirmWipe
}) => {
  const [selectedStandard, setSelectedStandard] = useState(defaultStandard)
  const [confirmedCheck, setConfirmedCheck] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedStandard(defaultStandard)
      setConfirmedCheck(false)
    }
  }, [defaultStandard, isOpen])

  if (!isOpen) return null

  const standards = [
    { id: 'nist-clear', name: 'NIST SP 800-88 Clear (1 Pass)', desc: 'Single-pass zero overwrite across all sectors.' },
    { id: 'nist-purge', name: 'NIST SP 800-88 Purge (1 Pass)', desc: 'Cryptographic random pattern overwrite.' },
    { id: 'dod-3', name: 'DoD 5220.22-M (3 Passes)', desc: '3-Pass military standard: Zero, one, random noise.' },
    { id: 'nvme-crypto', name: 'NVMe Sanitize Crypto-Erase', desc: 'Hardware cryptographic erase across controller.' }
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmedCheck) return
    onConfirmWipe(selectedStandard)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-atlas-text">
        <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shadow-xs">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-atlas-navy">
                Dispatch Batch Sanitization
              </h3>
              <p className="text-xs text-atlas-muted">
                Parallel sanitization across {selectedCount} selected workstations
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-atlas-muted hover:text-atlas-navy p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Irreversible Action:</strong> All storage devices on the selected workstations will be permanently erased.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-atlas-navy">Select Sanitization Standard:</label>
            {standards.map((s) => (
              <label
                key={s.id}
                className={`p-3 rounded-lg border block cursor-pointer transition ${
                  selectedStandard === s.id
                    ? 'border-atlas-forest bg-atlas-lightgreen/40 shadow-xs'
                    : 'border-atlas-border hover:border-atlas-borderhover bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="batchStandard"
                    value={s.id}
                    checked={selectedStandard === s.id}
                    onChange={(e) => setSelectedStandard(e.target.value)}
                    className="accent-emerald-600"
                  />
                  <strong className="text-atlas-navy">{s.name}</strong>
                </div>
                <p className="text-[11px] text-atlas-muted pl-5 mt-0.5">{s.desc}</p>
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-bold text-atlas-navy pt-2">
            <input
              type="checkbox"
              checked={confirmedCheck}
              onChange={(e) => setConfirmedCheck(e.target.checked)}
              className="accent-red-600 w-4 h-4 rounded cursor-pointer"
            />
            <span>I confirm authorization to sanitize {selectedCount} workstations</span>
          </label>

          <div className="pt-3 border-t border-atlas-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="atlas-btn-secondary px-4 py-2 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!confirmedCheck}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              Dispatch Batch Wipe
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BatchTriggerModal
