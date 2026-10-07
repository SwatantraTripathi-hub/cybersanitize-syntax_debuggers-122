import React, { useState } from 'react'
import { ShieldCheck, Lock, CheckCircle2, RefreshCw } from 'lucide-react'
import { useCase } from '../../../context/CaseContext'

interface WriteBlockerBadgeProps {
  drivePath?: string
  isLocked?: boolean
}

export const WriteBlockerBadge: React.FC<WriteBlockerBadgeProps> = ({
  drivePath = 'Target Storage Media',
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
      console.warn('Failed to verify write blocker:', err)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="bg-atlas-lightgreen border border-atlas-bordergreen rounded-lg p-3 shadow-xs space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white border border-atlas-bordergreen flex items-center justify-center text-atlas-forest shadow-xs shrink-0">
            <ShieldCheck className="w-4 h-4 text-atlas-forest" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-atlas-forest uppercase tracking-wider">
                Write Protection Interlock
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-atlas-forest font-bold border border-atlas-bordergreen">
                {verificationData ? 'VERIFIED' : (isLocked ? 'ACTIVE' : 'STANDBY')}
              </span>
            </div>
            <p className="text-[11px] text-atlas-muted">
              Device handle mounted with read-only access. Modifications rejected.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-atlas-forest bg-white border border-atlas-bordergreen px-2.5 py-1 rounded shadow-xs">
            <Lock className="w-3.5 h-3.5 text-atlas-forest" />
            <span className="font-semibold truncate max-w-[140px] md:max-w-xs">READ ONLY: {drivePath}</span>
          </div>

          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className="atlas-btn-secondary px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-xs"
          >
            <RefreshCw className={`w-3 h-3 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>Verify</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default WriteBlockerBadge
