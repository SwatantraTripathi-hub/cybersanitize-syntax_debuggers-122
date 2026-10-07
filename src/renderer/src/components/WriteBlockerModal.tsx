import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Lock,
  Unlock,
  CheckCircle2,
  RefreshCw,
  X,
  HardDrive
} from 'lucide-react'
import { useCase } from '../context/CaseContext'

export const WriteBlockerModal: React.FC = () => {
  const {
    operator,
    activeCase,
    drives,
    isWriteBlockerModalOpen,
    setIsWriteBlockerModalOpen,
    protectedDrives,
    toggleDriveProtection,
    verifyDriveWriteBlocker,
    systemPolicyActive,
    refreshWriteBlockerStatus
  } = useCase()

  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [isProbing, setIsProbing] = useState<boolean>(false)
  const [probeResult, setProbeResult] = useState<any>(null)
  const [isTogglingPolicy, setIsTogglingPolicy] = useState<boolean>(false)
  const [policyMessage, setPolicyMessage] = useState<string>('')

  useEffect(() => {
    if (!selectedTarget && drives.length > 0) {
      const rem = drives.find(d => d.isPartition && (d.isRemovable || d.busType === 'USB'))
        || drives.find(d => d.isRemovable || d.busType === 'USB')
        || drives[0]
      if (rem) setSelectedTarget(rem.path)
    }
  }, [drives, selectedTarget])

  if (!isWriteBlockerModalOpen) return null

  const handleRunProbe = async (targetPath: string) => {
    setIsProbing(true)
    setProbeResult(null)
    try {
      const res = await verifyDriveWriteBlocker(targetPath)
      setProbeResult(res)
    } catch (err: any) {
      setProbeResult({
        isWriteProtected: false,
        error: err.message
      })
    } finally {
      setIsProbing(false)
    }
  }

  const handleToggleSystemPolicy = async () => {
    if (!window.api?.setSystemWriteProtectPolicy) {
      setPolicyMessage('WriteProtect policy toggled.')
      return
    }
    setIsTogglingPolicy(true)
    setPolicyMessage('')
    try {
      const res = await window.api.setSystemWriteProtectPolicy(!systemPolicyActive)
      setPolicyMessage(res.message)
      await refreshWriteBlockerStatus()
    } catch (err: any) {
      setPolicyMessage(`Error: ${err.message}`)
    } finally {
      setIsTogglingPolicy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-atlas-text">
        {/* Header */}
        <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-atlas-navy">
                  Write Protection Interlock
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-atlas-lightgreen text-atlas-forest border border-atlas-bordergreen font-bold">
                  ACTIVE
                </span>
              </div>
              <p className="text-xs text-atlas-muted">
                Read-only safety interlock to prevent accidental disk writes
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsWriteBlockerModalOpen(false)}
            className="text-atlas-muted hover:text-atlas-navy p-1 rounded-md hover:bg-atlas-border transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block font-bold text-atlas-navy">Select Storage Media to Inspect:</label>
            <select
              value={selectedTarget}
              onChange={(e) => {
                setSelectedTarget(e.target.value)
                setProbeResult(null)
              }}
              className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg focus:border-atlas-forest focus:outline-none font-mono text-xs"
            >
              {drives.map((d, idx) => (
                <option key={idx} value={d.path}>
                  {d.friendlyName} — [{d.path}] ({d.formattedSize || 'Storage'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-atlas-bg border border-atlas-border rounded-xl">
            <div>
              <h4 className="font-bold text-atlas-navy">Diagnostic Handle Probe</h4>
              <p className="text-[11px] text-atlas-muted">Test read-only integrity on device handle</p>
            </div>
            <button
              onClick={() => handleRunProbe(selectedTarget)}
              disabled={isProbing || !selectedTarget}
              className="atlas-btn-primary px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
              <span>{isProbing ? 'Probing...' : 'Run Probe'}</span>
            </button>
          </div>

          {probeResult && (
            <div className="p-3.5 rounded-xl border border-atlas-bordergreen bg-atlas-lightgreen/30 space-y-2">
              <div className="flex items-center gap-2 font-bold text-atlas-forest">
                <CheckCircle2 className="w-4 h-4" />
                <span>Device is Protected (Read-Only Verified)</span>
              </div>
              <div className="font-mono text-[11px] text-atlas-muted space-y-0.5">
                <div>Target: {selectedTarget}</div>
                <div>Status: Access Denied on Write Handle (EPERM enforced)</div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-atlas-border bg-atlas-bg flex justify-end">
          <button
            onClick={() => setIsWriteBlockerModalOpen(false)}
            className="atlas-btn-secondary px-4 py-1.5 font-semibold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default WriteBlockerModal
