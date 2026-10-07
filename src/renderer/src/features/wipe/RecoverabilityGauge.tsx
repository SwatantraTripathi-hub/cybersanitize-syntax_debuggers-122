import React from 'react'
import { AlertTriangle, ShieldCheck, Activity } from 'lucide-react'

interface RecoverabilityGaugeProps {
  value: number
  level?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'SANITIZED'
  details?: string
  label?: string
  beforeValue?: number | null
}

export const RecoverabilityGauge: React.FC<RecoverabilityGaugeProps> = ({
  value,
  level = 'HIGH',
  details,
  label = 'Data Exposure Risk Gauge',
  beforeValue
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))

  const getColor = (val: number) => {
    if (val <= 10) return { stroke: '#00ed64', text: 'text-atlas-forest', bg: 'bg-atlas-lightgreen', border: 'border-atlas-bordergreen' }
    if (val <= 35) return { stroke: '#10b981', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    if (val <= 65) return { stroke: '#f59e0b', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
    return { stroke: '#ef4444', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
  }

  const style = getColor(clamped)
  const radius = 54
  const circumference = Math.PI * radius
  const strokeDashoffset = circumference - (clamped / 100) * circumference

  return (
    <div className="bg-white border border-atlas-border rounded-xl p-4 shadow-xs flex flex-col items-center justify-between">
      <div className="w-full flex items-center justify-between text-xs pb-2 border-b border-atlas-border mb-2">
        <span className="font-bold text-atlas-navy flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-atlas-forest" />
          {label}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${style.bg} ${style.text} ${style.border}`}>
          {clamped <= 10 ? 'SANITIZED' : level}
        </span>
      </div>

      <div className="relative flex flex-col items-center justify-center my-1">
        <svg width="150" height="85" viewBox="0 0 140 80" className="overflow-visible">
          <path
            d="M 16 75 A 54 54 0 0 1 124 75"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            d="M 16 75 A 54 54 0 0 1 124 75"
            fill="none"
            stroke={style.stroke}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease' }}
          />
        </svg>

        <div className="absolute bottom-1 flex flex-col items-center">
          <span className="text-2xl font-extrabold text-atlas-navy tracking-tight font-mono">
            {clamped}%
          </span>
          <span className="text-[10px] text-atlas-muted font-sans font-medium uppercase tracking-wider">
            {clamped <= 10 ? '0% Recoverable' : 'Data Exposure'}
          </span>
        </div>
      </div>

      {beforeValue !== undefined && beforeValue !== null && (
        <div className="w-full grid grid-cols-2 gap-2 text-center text-[10px] font-mono mt-2 pt-2 border-t border-atlas-border">
          <div className="bg-red-50 text-red-700 rounded p-1 border border-red-100">
            <span className="block font-sans text-gray-500 text-[9px]">Pre-Wipe</span>
            <span className="font-bold">{beforeValue}% Risk</span>
          </div>
          <div className="bg-atlas-lightgreen text-atlas-forest rounded p-1 border border-atlas-bordergreen">
            <span className="block font-sans text-gray-500 text-[9px]">Post-Wipe</span>
            <span className="font-bold">{clamped}% Risk</span>
          </div>
        </div>
      )}

      {details && (
        <p className="text-[10px] text-atlas-muted text-center mt-2 leading-relaxed font-sans px-1">
          {details}
        </p>
      )}
    </div>
  )
}

export default RecoverabilityGauge
