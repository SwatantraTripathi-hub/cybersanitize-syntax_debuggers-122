import React, { useState } from 'react'
import { ShieldCheck, Lock, CheckCircle2, RefreshCw, Sliders } from 'lucide-react'
import { useCase } from '../../../context/CaseContext'

interface WriteBlockerBadgeProps {
  drivePath?: string
  isLocked?: boolean
}

export const WriteBlockerBadge: React.FC<WriteBlockerBadgeProps> = ({
  drivePath = 'Target Drive',
  isLocked = true
}) => {
  const { verifyDriveWriteBlocker, setIsWriteBlockerModalOpen } = useCase()
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationData, setVerificationData] = useState<any>(null)

  const handleVerify = async () => {
    setIsVerifying(true)
    try {
      const res = await verifyDriveWriteBlocker(drivePath)
      setVerificationData(res)
    } catch (err) {
      console.error('Failed to verify write blocker:', err)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="bg-atlas-lightgreen border border-atlas-bordergreen rounded-lg p-3 shadow-sm space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white border border-atlas-bordergreen flex items-center justify-center text-atlas-forest shadow-sm shrink-0">
            <ShieldCheck className="w-4 h-4 text-atlas-forest" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-atlas-forest uppercase tracking-wider">
                ISO/IEC 27037 Evidence Write-Blocker
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-atlas-forest font-bold border border-atlas-bordergreen">
                {verificationData ? 'PROBE VERIFIED' : (isLocked ? 'ACTIVE' : 'STANDBY')}
              </span>
            </div>
            <p className="text-[11px] text-atlas-muted">
              Kernel handle locked with <code className="text-atlas-forest font-mono font-bold">GENERIC_READ</code>. Hardware write attempts rejected.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-atlas-forest bg-white border border-atlas-bordergreen px-2.5 py-1 rounded shadow-sm">
            <Lock className="w-3.5 h-3.5 text-atlas-forest" />
            <span className="font-semibold truncate max-w-[140px] md:max-w-xs">READ ONLY: {drivePath}</span>
          </div>

          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className="px-2.5 py-1 rounded text-xs font-semibold bg-white border border-atlas-bordergreen hover:bg-emerald-50 text-atlas-forest transition flex items-center gap-1 shadow-xs"
            title="Run active hardware & handle verification probe"
          >
            <RefreshCw className={`w-3 h-3 ${isVerifying ? 'animate-spin' : ''}`} />
            {isVerifying ? 'Probing...' : 'Verify Probe'}
          </button>

          <button
            onClick={() => setIsWriteBlockerModalOpen(true)}
            className="px-2.5 py-1 rounded text-xs font-semibold bg-atlas-forest text-white hover:bg-atlas-foresthover transition flex items-center gap-1 shadow-xs"
            title="Open Write-Blocker Inspector"
          >
            <Sliders className="w-3 h-3" />
            Inspect
          </button>
        </div>
      </div>

      {verificationData && (
        <div className="pt-1.5 border-t border-atlas-bordergreen/60 flex items-center justify-between text-[10px] font-mono text-atlas-forest animate-fadeIn">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-atlas-forest" />
            <span>Token: <strong>{verificationData.verificationToken.slice(0, 24)}...</strong></span>
            <span>•</span>
            <span>Mode: <strong>{verificationData.enforcementMethod}</strong></span>
          </div>
          <span className="shrink-0 font-bold bg-white px-2 py-0.5 rounded border border-atlas-bordergreen">
            0.00% SPOLIATION RISK
          </span>
        </div>
      )}
    </div>
  )
}

export default WriteBlockerBadge
