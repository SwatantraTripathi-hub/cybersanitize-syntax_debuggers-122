import React from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

interface RecoverabilityGaugeProps {
  score: number // 0 to 100
  title?: string
  subtitle?: string
}

export const RecoverabilityGauge: React.FC<RecoverabilityGaugeProps> = ({
  score = 85,
  title = 'Data Recoverability Danger Meter',
  subtitle = 'Measures residual forensic signature density across sampled disk clusters'
}) => {
  // Clamp score
  const clamped = Math.max(0, Math.min(100, score))
  
  // Determine risk profile
  const isHighRisk = clamped >= 60
  const isMediumRisk = clamped >= 20 && clamped < 60
  const isSafe = clamped < 20

  const statusColor = isHighRisk 
    ? 'text-red-500 stroke-red-500' 
    : isMediumRisk 
    ? 'text-amber-500 stroke-amber-500' 
    : 'text-emerald-500 stroke-emerald-500'

  const strokeDashoffset = 251.2 - (251.2 * clamped) / 100

  return (
    <div className="bg-atlas-card border border-atlas-border rounded-xl p-5 shadow-lg flex flex-col items-center text-center">
      <div className="flex items-center gap-2 mb-2">
        {isSafe ? (
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
        ) : (
          <ShieldAlert className="w-5 h-5 text-red-400" />
        )}
        <h4 className="text-sm font-semibold text-white tracking-wide uppercase">{title}</h4>
      </div>
      <p className="text-xs text-atlas-muted mb-4 max-w-xs">{subtitle}</p>

      {/* SVG Arc Gauge */}
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            className="stroke-atlas-navy fill-transparent"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            className={`fill-transparent transition-all duration-1000 ease-out ${statusColor}`}
            strokeWidth="8"
            strokeDasharray="251.2"
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
            {clamped}%
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'}`}>
            {isHighRisk ? 'High Risk' : isMediumRisk ? 'Moderate' : 'Sanitized'}
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-4 text-xs font-mono">
        <span className="flex items-center gap-1.5 text-atlas-muted">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Recoverable
        </span>
        <span className="flex items-center gap-1.5 text-atlas-muted">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Sanitized
        </span>
      </div>
    </div>
  )
}

export default RecoverabilityGauge
