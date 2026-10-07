import React from 'react'
import {
  HardDrive,
  Network,
  ArrowRight,
  Shield,
  Layers,
  Cpu,
  CheckCircle2,
  Briefcase,
  FolderPlus,
  Play,
  ShieldCheck
} from 'lucide-react'
import { useCase } from '../context/CaseContext'

export const OrchestrationLanding: React.FC = () => {
  const {
    operator,
    caseList,
    setActiveCase,
    setOrchestrationMode,
    setIsCaseModalOpen,
    setIsFleetCreateModalOpen,
    setIsWriteBlockerModalOpen,
    setIsDemoModalOpen,
    protectedDrives
  } = useCase()

  const handleLaunchSingle = () => {
    setIsCaseModalOpen(true)
  }

  const handleLaunchFleet = () => {
    setIsFleetCreateModalOpen(true)
  }

  const handleResumeWorkspace = (c: any) => {
    setActiveCase(c)
    setOrchestrationMode('SINGLE')
  }

  return (
    <div className="min-h-screen bg-atlas-bg text-atlas-text flex flex-col justify-between">
      {/* Top Brand Bar */}
      <header className="h-16 bg-white border-b border-atlas-border px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-atlas-forest flex items-center justify-center text-atlas-green shadow-xs">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-atlas-navy text-base tracking-tight">CyberSanitize</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-atlas-lightgreen text-atlas-forest font-bold border border-atlas-bordergreen">
                ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-atlas-muted">Storage Management & Sanitization Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Write Protection Status */}
          <button
            onClick={() => setIsWriteBlockerModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-atlas-lightgreen border border-atlas-bordergreen text-atlas-forest font-semibold text-[11px] hover:bg-emerald-100 transition shadow-xs"
          >
            <span className="w-2 h-2 rounded-full bg-atlas-forest animate-pulse"></span>
            <span>Write Protection Active</span>
            {protectedDrives.length > 0 && (
              <span className="ml-1 px-1.5 bg-white text-atlas-forest rounded-full text-[9px] font-mono font-bold border border-atlas-bordergreen">
                {protectedDrives.length}
              </span>
            )}
          </button>

          {/* Operator Profile */}
          <button
            onClick={() => setIsCaseModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-atlas-border bg-atlas-bg hover:bg-white text-atlas-text transition"
          >
            <div className="w-6 h-6 rounded-full bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="font-mono text-xs font-bold text-atlas-navy leading-none">{operator.operatorId}</div>
              <div className="text-[10px] text-atlas-forest font-semibold leading-none mt-1">{operator.role}</div>
            </div>
          </button>
        </div>
      </header>

      {/* Main Orchestration Hero Section */}
      <main className="max-w-5xl w-full mx-auto px-6 py-12 flex-1 space-y-12">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-atlas-navy tracking-tight">
            Select Operational Architecture
          </h1>
          <p className="text-sm text-atlas-muted">
            Choose between direct local storage operations or multi-device fleet management
          </p>
        </div>

        {/* Dual Mode Cards (Clean, Spacious, No Dense Text) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card 1: Single Device */}
          <div className="atlas-card p-8 flex flex-col justify-between hover:shadow-atlas-hover transition-all border-t-4 border-t-atlas-forest group bg-white">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-xl bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest shadow-xs group-hover:scale-105 transition-transform">
                  <HardDrive className="w-7 h-7" />
                </div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-atlas-bg text-atlas-muted border border-atlas-border">
                  Direct Station
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-atlas-navy tracking-tight">
                  Single Device
                </h2>
                <p className="text-xs text-atlas-muted mt-1 leading-relaxed">
                  Manage, sanitize, and recover storage drives connected directly to this machine.
                </p>
              </div>

              {/* Minimal tags */}
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="px-2.5 py-1 rounded-md bg-atlas-bg text-atlas-navy text-xs font-medium border border-atlas-border">
                  Direct Disk I/O
                </span>
                <span className="px-2.5 py-1 rounded-md bg-atlas-bg text-atlas-navy text-xs font-medium border border-atlas-border">
                  NIST 800-88 Sanitization
                </span>
                <span className="px-2.5 py-1 rounded-md bg-atlas-bg text-atlas-navy text-xs font-medium border border-atlas-border">
                  Data Recovery
                </span>
                <span className="px-2.5 py-1 rounded-md bg-atlas-bg text-atlas-navy text-xs font-medium border border-atlas-border">
                  Compliance Reports
                </span>
              </div>
            </div>

            <div className="pt-8 mt-6 border-t border-atlas-border">
              <button
                onClick={handleLaunchSingle}
                className="w-full atlas-btn-primary py-3 px-5 text-sm font-bold flex items-center justify-center gap-2 shadow-sm group-hover:bg-atlas-foresthover transition"
              >
                <span>Launch Single Station</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Card 2: Multi-Device Fleet */}
          <div className="atlas-card p-8 flex flex-col justify-between hover:shadow-atlas-hover transition-all border-t-4 border-t-emerald-600 group bg-white">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs group-hover:scale-105 transition-transform">
                  <Network className="w-7 h-7" />
                </div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  Local Network Mesh
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-atlas-navy tracking-tight">
                  Multi-Device Fleet
                </h2>
                <p className="text-xs text-atlas-muted mt-1 leading-relaxed">
                  Centrally coordinate and sanitize multiple workstations over an offline local network.
                </p>
              </div>

              {/* Minimal tags */}
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                  Room Key Pairing
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                  Pre-Sanitization Audit
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                  Parallel Batch Execution
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                  Fleet Dossier
                </span>
              </div>
            </div>

            <div className="pt-8 mt-6 border-t border-atlas-border">
              <button
                onClick={handleLaunchFleet}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 px-5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition group-hover:shadow-md"
              >
                <span>Create Fleet Workspace</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Recent Workspaces Quick-Resume Section */}
        <div className="bg-white border border-atlas-border rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-atlas-forest" />
              <h3 className="font-bold text-sm text-atlas-navy">Recent Workspaces</h3>
            </div>
            <button
              onClick={() => setIsCaseModalOpen(true)}
              className="text-xs text-atlas-forest hover:underline font-semibold flex items-center gap-1"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New Workspace</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {caseList.slice(0, 4).map((c) => (
              <div
                key={c.caseId}
                onClick={() => handleResumeWorkspace(c)}
                className="p-3.5 rounded-lg border border-atlas-border hover:border-atlas-bordergreen hover:bg-atlas-lightgreen/30 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="space-y-0.5 truncate pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-atlas-forest">{c.caseId}</span>
                    <span className="text-[10px] text-atlas-muted bg-atlas-bg px-2 py-0.2 rounded border border-atlas-border">{c.evidenceTag}</span>
                  </div>
                  <div className="text-xs font-semibold text-atlas-navy truncate">{c.title}</div>
                </div>
                <button className="px-3 py-1 rounded-md text-xs font-semibold text-atlas-forest bg-atlas-lightgreen border border-atlas-bordergreen group-hover:bg-atlas-forest group-hover:text-white transition shrink-0">
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Clean Footer Bar */}
      <footer className="h-12 bg-atlas-navydark border-t border-white/10 px-8 flex items-center justify-between text-xs text-atlas-lightmuted shrink-0">
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-white/90">
            <span className="w-2 h-2 rounded-full bg-atlas-green"></span>
            <span>Direct I/O: Online</span>
          </span>
          <span className="text-white/20">•</span>
          <span className="text-white/80">Storage Engine: Win32 Direct</span>
          <span className="text-white/20">•</span>
          <span className="text-white/80">Ledger: SQLite Active</span>
        </div>

        <div className="text-[11px] font-mono text-atlas-lightmuted">
          CyberSanitize Enterprise v1.0.0
        </div>
      </footer>
    </div>
  )
}

export default OrchestrationLanding
