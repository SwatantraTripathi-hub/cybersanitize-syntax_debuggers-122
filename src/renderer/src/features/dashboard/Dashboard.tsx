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
  ArrowLeft
} from 'lucide-react'
import { useCase } from '../../context/CaseContext'

export const Dashboard: React.FC = () => {
  const { 
    activeCase, 
    operator, 
    setIsCaseModalOpen, 
    exportCase, 
    selectedFleetNode, 
    backToFleetOverview 
  } = useCase()

  const [stats, setStats] = useState<{ total: number; carves: number; wipes: number; erases: number }>({
    total: 25,
    carves: 14,
    wipes: 1,
    erases: 8
  })
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [viewScope, setViewScope] = useState<'case' | 'all'>('case')

  useEffect(() => {
    setRecentLogs([
      { id: 104, operation: 'DRIVE_SANITIZATION', target: '\\\\.\\PhysicalDrive1', operator: operator.name, timestamp: '10:42:15', status: 'VERIFIED' },
      { id: 103, operation: 'DATA_RECOVERY', target: 'Unallocated Sectors', operator: operator.name, timestamp: '10:38:22', status: 'COMPLETED' },
      { id: 102, operation: 'WRITE_PROTECTION', target: 'Volume Lock Guard', operator: operator.name, timestamp: '10:35:10', status: 'ACTIVE' },
      { id: 101, operation: 'WORKSPACE_INIT', target: activeCase.caseId, operator: operator.name, timestamp: '10:30:00', status: 'SEALED' }
    ])

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
      {selectedFleetNode && (
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
            onClick={() => exportCase(activeCase)}
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

            {/* File Shredder Card */}
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
              {recentLogs.slice(0, 4).map((log) => (
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
