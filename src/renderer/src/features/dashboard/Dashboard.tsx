import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  HardDrive, 
  FileX, 
  Search, 
  Activity, 
  ShieldCheck, 
  Briefcase, 
  FileText, 
  ArrowRight,
  Download,
  Filter,
  Laptop,
  ArrowLeft,
  Radio,
  CheckCircle2,
  Flame,
  Layers
} from 'lucide-react'
import { useCase } from '../../context/CaseContext'

export const Dashboard: React.FC = () => {
  const { 
    activeCase, 
    operator, 
    setIsCaseModalOpen, 
    exportCase, 
    selectedFleetNode, 
    isJoinedClientNode,
    isWebSocketConnected,
    joinedWorkspaceMeta,
    backToFleetOverview 
  } = useCase()

  const [stats, setStats] = useState<{ total: number; carves: number; wipes: number; erases: number }>({
    total: 0,
    carves: 0,
    wipes: 0,
    erases: 0
  })
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [viewScope, setViewScope] = useState<'case' | 'all'>('case')
  const assignedOptions = {
    wipeStandard: 'nist-clear',
    recoveryTypes: ['DOCX', 'PDF', 'SQLITE'],
    writeBlockerEnforced: true,
    preScanEnabled: true,
    ...(joinedWorkspaceMeta?.selectedOptions ?? {})
  }
  const standardNames: Record<string, string> = {
    'nist-clear': 'NIST SP 800-88 Clear',
    'nist-purge': 'NIST SP 800-88 Purge',
    'nvme-crypto': 'NVMe Cryptographic Erase',
    'dod-3': 'DoD 5220.22-M (3-pass)',
    'dod-7': 'DoD 5220.22-M (7-pass)'
  }

  useEffect(() => {

    const loadData = async () => {
      try {
        if (window.api?.getAuditStats) {
          const s = await window.api.getAuditStats(viewScope === 'case' ? activeCase.caseId : undefined)
          if (s) setStats(s)
        }
        if (window.api?.getAuditLogs) {
          const logs = await window.api.getAuditLogs({
            limit: 4,
            caseId: viewScope === 'case' ? activeCase.caseId : undefined
          })
          if (logs && logs.length > 0) setRecentLogs(logs)
        }
      } catch (err) {
        console.warn('Dashboard load fallback used:', err)
      }
    }
    loadData()
  }, [activeCase.caseId, viewScope])

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Fleet Node Context Banner (if viewing specific node in fleet mode) */}
      {selectedFleetNode && !isJoinedClientNode && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-emerald-950 text-xs">
                Active Fleet Workstation: {selectedFleetNode.model}
              </span>
              <span className="font-mono text-[11px] ml-2 text-emerald-800">
                {selectedFleetNode.hostname} ({selectedFleetNode.ip}) • {selectedFleetNode.storage}
              </span>
            </div>
          </div>

          <button
            onClick={backToFleetOverview}
            className="atlas-btn-secondary px-3 py-1 text-xs font-semibold flex items-center gap-1.5 bg-white hover:bg-emerald-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Fleet Mesh</span>
          </button>
        </div>
      )}

      {/* Central Host Configuration & Directives for this Workstation */}
      {(selectedFleetNode || isJoinedClientNode) && (
        <div className="bg-white border-2 border-emerald-500/30 rounded-xl p-5 shadow-atlas space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-atlas-border gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-atlas-navy">
                    {isJoinedClientNode ? 'Central Coordinator Assigned Directives' : 'Fleet Workstation Profile & Assigned Directives'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ROOM: {activeCase.fleetKey || 'CS-FLEET-8492'}
                  </span>
                </div>
                <p className="text-[11px] text-atlas-muted">
                  Parameters designated by {activeCase.authorizingOfficer} for this secondary workstation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-emerald-600 animate-pulse' : 'bg-red-500'}`}></span>
              <span className={`font-mono text-[11px] font-semibold ${isWebSocketConnected ? 'text-emerald-700' : 'text-red-700'}`}>
                {isWebSocketConnected ? 'Coordinator link active' : 'Coordinator disconnected'} · {activeCase.fleetKey}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-atlas-muted block">
                Sanitization Standard
              </span>
              <div className="font-bold text-atlas-navy flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                <span>{standardNames[assignedOptions.wipeStandard] || assignedOptions.wipeStandard}</span>
              </div>
              <span className="text-[10px] text-atlas-muted block">Assigned by the central workspace coordinator</span>
            </div>

            <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-atlas-muted block">
                Target Storage Media
              </span>
              <div className="font-bold text-atlas-navy flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-atlas-forest" />
                <span className="truncate">{selectedFleetNode?.storage || '512 GB NVMe Direct'}</span>
              </div>
              <span className="text-[10px] text-atlas-muted block">Win32 Native DMA Interlock</span>
            </div>

            <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-atlas-muted block">
                Recovery Signatures
              </span>
              <div className="font-bold text-atlas-navy flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-600" />
                <span>{assignedOptions.recoveryTypes?.length ? assignedOptions.recoveryTypes.join(', ') : 'No recovery types assigned'}</span>
              </div>
              <span className="text-[10px] text-atlas-muted block">Assigned recovery signature types</span>
            </div>

            <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-atlas-muted block">
                Forensic Write Blocker
              </span>
              <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{assignedOptions.writeBlockerEnforced ? 'ISO 27037 Enforced' : 'Not required by coordinator'}</span>
              </div>
              <span className="text-[10px] text-atlas-muted block">{assignedOptions.writeBlockerEnforced ? 'Kernel Read-Only Volume Lock' : 'Write-blocker policy is disabled'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-atlas-bg border border-atlas-border px-3 py-2 text-[11px]">
            <CheckCircle2 className={`w-3.5 h-3.5 ${assignedOptions.preScanEnabled ? 'text-emerald-600' : 'text-atlas-muted'}`} />
            <span className="font-semibold text-atlas-navy">Pre-sanitization scan:</span>
            <span className="text-atlas-muted">{assignedOptions.preScanEnabled ? 'Enabled by central coordinator' : 'Not enabled for this workspace'}</span>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-atlas-muted flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Secondary client synchronized with central fleet workspace ledger.</span>
            </span>

            <div className="flex items-center gap-2">
              <Link
                to="/drive-eraser"
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 transition flex items-center gap-1"
              >
                <Flame className="w-3 h-3 text-amber-600" />
                <span>Open Sanitizer</span>
              </Link>
              <Link
                to="/recovery"
                className="atlas-btn-primary px-3 py-1.5 text-xs font-bold flex items-center gap-1"
              >
                <Search className="w-3 h-3" />
                <span>Open Recovery</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 1. Compact Active Workspace Header */}
      <div className="atlas-card px-5 py-3.5 shadow-atlas flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-atlas-forest bg-white">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-atlas-lightgreen text-atlas-forest font-mono text-[11px] font-bold border border-atlas-bordergreen">
              WORKSPACE: {activeCase.caseId}
            </span>
            <span className="text-[11px] font-mono text-atlas-muted bg-atlas-bg px-2 py-0.5 rounded-full border border-atlas-border">
              Asset: {activeCase.evidenceTag}
            </span>
            <span className="text-xs font-bold text-atlas-navy truncate max-w-md">
              {activeCase.title}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-atlas-muted">
            <span>Authorizer: <strong className="text-atlas-navy">{activeCase.authorizingOfficer}</strong></span>
            <span>•</span>
            <span>Administrator: <strong className="text-atlas-navy">{operator.name}</strong></span>
            <span>•</span>
            <span>Classification: <strong className="text-atlas-navy">{activeCase.classification}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsCaseModalOpen(true)}
            className="atlas-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-xs"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Switch Workspace</span>
          </button>

          <button
            onClick={() => { void exportCase(activeCase) }}
            className="atlas-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-atlas-forest" />
            <span>Export (.json)</span>
          </button>
        </div>
      </div>

      {/* 2. Four Compact KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[
          { label: 'Total Operations', value: stats.total, icon: Activity },
          { label: 'Files Recovered', value: stats.carves, icon: Search },
          { label: 'Drives Sanitized', value: stats.wipes, icon: HardDrive },
          { label: 'Files Shredded', value: stats.erases, icon: FileX }
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <div key={i} className="atlas-card px-4 py-3 shadow-atlas flex items-center justify-between bg-white">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-atlas-muted">{item.label}</span>
                <div className="text-xl font-bold font-mono text-atlas-navy mt-0.5">{item.value.toLocaleString()}</div>
              </div>
              <div className="p-2 rounded-lg bg-atlas-bg border border-atlas-border text-atlas-forest">
                <Icon className="w-4 h-4" />
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. Bottom Two-Column Split (Operations on Left, Activity Log on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 Cols): The 3 Operations */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-atlas-muted">
              Primary Operations
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Recovery Card */}
            <Link
              to="/recovery"
              className="atlas-card p-4 shadow-atlas hover:shadow-atlas-hover transition-all group flex flex-col justify-between bg-white"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest mb-2.5 group-hover:scale-105 transition-transform">
                  <Search className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs text-atlas-navy flex items-center justify-between">
                  Data Recovery
                  <ArrowRight className="w-3.5 h-3.5 text-atlas-muted group-hover:text-atlas-forest group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-[11px] text-atlas-muted mt-1 leading-snug">
                  Sector-level scan & deleted file reconstruction.
                </p>
              </div>
            </Link>

            {/* Drive Sanitizer Card */}
            <Link
              to="/drive-eraser"
              className="atlas-card p-4 shadow-atlas hover:shadow-atlas-hover transition-all group flex flex-col justify-between bg-white"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest mb-2.5 group-hover:scale-105 transition-transform">
                  <HardDrive className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs text-atlas-navy flex items-center justify-between">
                  Drive Sanitizer
                  <ArrowRight className="w-3.5 h-3.5 text-atlas-muted group-hover:text-atlas-forest group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-[11px] text-atlas-muted mt-1 leading-snug">
                  Certified multi-pass disk erasure & heatmap.
                </p>
              </div>
            </Link>

            {orchestrationMode !== 'MULTI' && (
              <Link
                to="/file-eraser"
                className="atlas-card p-4 shadow-atlas hover:shadow-atlas-hover transition-all group flex flex-col justify-between bg-white"
              >
                <div>
                  <div className="w-8 h-8 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest mb-2.5 group-hover:scale-105 transition-transform">
                    <FileX className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-xs text-atlas-navy flex items-center justify-between">
                    File Shredder
                    <ArrowRight className="w-3.5 h-3.5 text-atlas-muted group-hover:text-atlas-forest group-hover:translate-x-0.5 transition-all" />
                  </h3>
                  <p className="text-[11px] text-atlas-muted mt-1 leading-snug">
                    Targeted file erasure & slack purging.
                  </p>
                </div>
              </Link>
            )}
          </div>
        </div>

        {/* Right Column (5 Cols): Compact Recent Activity */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-atlas-muted flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-atlas-forest" />
              <span>Recent Activity</span>
            </h2>
            <Link to="/audit" className="text-[11px] font-semibold text-atlas-forest hover:underline">
              View Audit Trail →
            </Link>
          </div>

          <div className="bg-white border border-atlas-border rounded-xl p-3.5 shadow-atlas space-y-2">
            <div className="divide-y divide-atlas-border text-xs">
              {recentLogs.length === 0 ? (
                <div className="py-8 text-center text-atlas-muted text-xs">
                  No activity recorded yet in this workspace. Operations performed will appear here.
                </div>
              ) : (
                recentLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="py-2 flex items-center justify-between first:pt-0 last:pb-0">
                    <div className="space-y-0.5 truncate pr-2">
                      <div className="font-bold text-atlas-navy text-[11px] truncate">{log.operation}</div>
                      <div className="font-mono text-[10px] text-atlas-muted truncate">{log.target}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-atlas-lightgreen text-atlas-forest border border-atlas-bordergreen">
                        {log.status}
                      </span>
                      <div className="text-[9px] font-mono text-atlas-muted mt-0.5">{log.timestamp}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
