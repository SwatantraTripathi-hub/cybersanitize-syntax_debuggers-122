import React from 'react'
import {
  Laptop,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Activity,
  Zap,
  SlidersHorizontal,
  Flame,
  Search
} from 'lucide-react'
import { FleetNode } from '../../../context/CaseContext'

interface NodeCardProps {
  node: FleetNode
  onToggleSelect: (id: string) => void
  onOpenEngine: (node: FleetNode) => void
  onInspectPreScan?: () => void
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  onToggleSelect,
  onOpenEngine,
  onInspectPreScan
}) => {
  const getStatusBadge = () => {
    switch (node.status) {
      case 'ONLINE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
            ONLINE / IDLE
          </span>
        )
      case 'PRE-SCANNING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            PRE-SCANNING
          </span>
        )
      case 'SANITIZING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-600 animate-bounce" />
            SANITIZING ({node.progress}%)
          </span>
        )
      case 'RECOVERING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
            <Search className="w-3 h-3 text-indigo-600 animate-pulse" />
            RECOVERING
          </span>
        )
      case 'ERASING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
            <Flame className="w-3 h-3 animate-pulse" />
            ERASING ({node.progress}%)
          </span>
        )
      case 'VERIFIED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-atlas-lightgreen text-atlas-forest border border-atlas-bordergreen flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-atlas-forest" />
            VERIFIED COMPLIANT
          </span>
        )
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-atlas-bg text-atlas-muted border border-atlas-border">
            IDLE
          </span>
        )
    }
  }

  return (
    <div
      className={`atlas-card p-5 transition-all flex flex-col justify-between space-y-4 ${
        node.selected
          ? 'border-atlas-forest/60 shadow-atlas bg-white ring-1 ring-atlas-forest/20'
          : 'border-atlas-border bg-white hover:border-atlas-borderhover'
      }`}
    >
      <div className="space-y-3">
        {/* Top Header Row with Checkbox & Hostname */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={node.selected}
              onChange={() => onToggleSelect(node.id)}
              className="w-4 h-4 rounded text-atlas-forest focus:ring-atlas-forest border-atlas-border cursor-pointer accent-emerald-600"
            />
            <div className="w-9 h-9 rounded-lg bg-atlas-bg border border-atlas-border flex items-center justify-center text-atlas-forest shadow-xs">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-atlas-navy leading-tight">{node.model}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[11px] font-bold text-atlas-forest">{node.hostname}</span>
                <span className="text-[10px] text-atlas-muted font-mono">• {node.ip}</span>
              </div>
            </div>
          </div>

          <div className="shrink-0">{getStatusBadge()}</div>
        </div>

        {/* Hardware & Network Specs */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-atlas-bg p-2.5 rounded-lg border border-atlas-border">
          <div className="truncate">
            <span className="text-atlas-muted block text-[9px] uppercase tracking-wider">Storage Media:</span>
            <span className="font-bold text-atlas-navy truncate flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-atlas-forest shrink-0" />
              {node.storage}
            </span>
          </div>
          <div className="truncate">
            <span className="text-atlas-muted block text-[9px] uppercase tracking-wider">MAC Address:</span>
            <span className="font-bold text-atlas-muted truncate">{node.mac}</span>
          </div>
        </div>

        {node.drives?.length > 0 && (
          <div className="rounded-lg border border-atlas-border bg-white p-2.5 space-y-1.5">
            <span className="text-[9px] uppercase tracking-wider font-bold text-atlas-muted">
              Available Internal & External Targets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {node.drives.map((drive) => (
                <span key={`${drive.path}-${drive.number}`} className="px-2 py-1 rounded border border-atlas-border bg-atlas-bg text-[10px] font-mono text-atlas-navy" title={drive.path}>
                  {drive.friendlyName} {drive.isRemovable ? '(External)' : '(Internal)'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Real-time Progress Bar (if active) */}
        {(node.status === 'SANITIZING' || node.status === 'PRE-SCANNING' || node.status === 'RECOVERING' || node.progress > 0) && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] font-mono font-bold">
              <span className="text-atlas-navy">Execution Progress:</span>
              <span className="text-atlas-forest">{node.progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-atlas-border">
              <div
                className="h-full bg-atlas-forest transition-all duration-300 rounded-full"
                style={{ width: `${node.progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-atlas-muted">
              <span>Throughput: {node.speed}</span>
              <span>ETA: {node.eta}</span>
            </div>
          </div>
        )}

        {/* Pre-Scan Findings Pill (if available) */}
        {node.preScanFindings && (
          <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                Pre-Scan Inventory:
              </span>
              <span className="font-mono text-emerald-800">
                {node.preScanFindings.filesFound.toLocaleString()} Items Discovered
              </span>
            </div>
            <div className="text-[10px] text-emerald-800 flex flex-wrap gap-2 pt-0.5">
              <span>Docs: <strong>{node.preScanFindings.docs}</strong></span>
              <span>•</span>
              <span>Media: <strong>{node.preScanFindings.media}</strong></span>
              <span>•</span>
              <span>Databases: <strong>{node.preScanFindings.databases}</strong></span>
              <span>•</span>
              <span>Entropy: <strong>{node.preScanFindings.entropy.toFixed(2)}</strong></span>
            </div>
          </div>
        )}

        {/* Latest Activity Log Feedback */}
        <div className="text-[11px] text-atlas-muted font-mono bg-white p-2 rounded border border-atlas-border/80 truncate">
          <span className="text-atlas-forest font-bold">Status:</span> {node.lastLog}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-atlas-border flex items-center justify-between">
        <span className="text-[10px] font-mono text-atlas-lightmuted">
          Node ID: {node.id}
        </span>
        <button
          onClick={() => onOpenEngine(node)}
          className="atlas-btn-primary px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-xs"
        >
          <span>Open Device Engine</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default NodeCard
