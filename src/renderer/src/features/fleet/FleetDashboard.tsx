import React, { useState } from 'react'
import {
  Network,
  Laptop,
  CheckCircle2,
  RefreshCw,
  Flame,
  Search,
  ShieldCheck,
  Download,
  ArrowLeft,
  Sliders,
  Layers,
  Terminal,
  FileText
} from 'lucide-react'
import { useCase, FleetNode } from '../../context/CaseContext'
import NodeCard from './components/NodeCard'
import PreScanModal from './components/PreScanModal'
import BatchTriggerModal from './components/BatchTriggerModal'

export const FleetDashboard: React.FC = () => {
  const {
    fleetKey,
    fleetWorkspaceName,
    joinedWorkspaceMeta,
    connectedNodes,
    toggleNodeSelection,
    selectAllNodes,
    dispatchBatchPreScan,
    dispatchBatchWipe,
    dispatchBatchRecovery,
    selectFleetNodeForEngine,
    backToLanding
  } = useCase()

  const [isPreScanModalOpen, setIsPreScanModalOpen] = useState(false)
  const [isBatchWipeModalOpen, setIsBatchWipeModalOpen] = useState(false)
  const [telemetryLog, setTelemetryLog] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Local LAN WebSocket fleet host initialized on port 4096.`,
    `[${new Date().toLocaleTimeString()}] Waiting for workstations to join room ${fleetKey}.`
  ])

  const selectedCount = connectedNodes.filter(n => n.selected).length
  const allSelected = connectedNodes.length > 0 && selectedCount === connectedNodes.length
  const onlineCount = connectedNodes.filter(node => node.status !== 'OFFLINE').length
  const assignedOptions = {
    wipeStandard: 'nist-clear',
    recoveryTypes: ['DOCX', 'PDF', 'SQLITE'],
    preScanEnabled: true,
    ...(joinedWorkspaceMeta?.selectedOptions ?? {})
  }

  const handleExportConsolidatedDossier = () => {
    const payload = {
      fleetKey,
      workspaceName: fleetWorkspaceName,
      timestamp: new Date().toISOString(),
      nodes: connectedNodes
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.href = dataStr
    downloadAnchor.download = `${fleetKey}_Fleet_Dossier.json`
    downloadAnchor.click()
  }

  const handleTriggerPreScan = () => {
    if (!assignedOptions.preScanEnabled) return
    dispatchBatchPreScan()
    setTelemetryLog(prev => [
      `[${new Date().toLocaleTimeString()}] Pre-scan triggered on ${selectedCount} workstations.`,
      ...prev
    ])
    setTimeout(() => {
      setIsPreScanModalOpen(true)
    }, 2000)
  }

  const handleTriggerBatchWipe = (standard: string) => {
    dispatchBatchWipe(standard)
    setTelemetryLog(prev => [
      `[${new Date().toLocaleTimeString()}] Batch sanitization (${standard}) dispatched to ${selectedCount} workstations.`,
      ...prev
    ])
  }

  const handleTriggerBatchRecovery = () => {
    dispatchBatchRecovery(assignedOptions.recoveryTypes)
    setTelemetryLog(prev => [
      `[${new Date().toLocaleTimeString()}] Batch recovery dispatched to ${selectedCount} workstations.`,
      ...prev
    ])
  }

  return (
    <div className="min-h-screen bg-atlas-bg text-atlas-text flex flex-col justify-between">
      {/* Top Banner Header */}
      <header className="h-16 bg-white border-b border-atlas-border px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={backToLanding}
            className="p-1.5 rounded-lg border border-atlas-border hover:bg-atlas-bg text-atlas-muted hover:text-atlas-navy transition flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Switch Mode</span>
          </button>

          <div className="h-6 w-px bg-atlas-border hidden sm:block"></div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-atlas-navy text-sm md:text-base tracking-tight">
                {fleetWorkspaceName}
              </span>
              <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-full bg-atlas-lightgreen text-atlas-forest border border-atlas-bordergreen">
                ROOM: {fleetKey}
              </span>
            </div>
            <p className="text-[11px] text-atlas-muted flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              <span>Offline Local Mesh • {connectedNodes.length} Workstations Connected</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportConsolidatedDossier}
            className="atlas-btn-secondary px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-atlas-forest" />
            <span>Export Fleet Dossier</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 space-y-6">
        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Workstations Online',
              value: `${onlineCount} / ${connectedNodes.length}`,
              sub: connectedNodes.length ? 'Live WebSocket connections' : 'Waiting for clients to join',
              icon: Laptop
            },
            {
              label: 'Aggregated Storage',
              value: `${connectedNodes.length} workstation${connectedNodes.length === 1 ? '' : 's'}`,
              sub: 'Connected to this fleet room',
              icon: Layers
            },
            {
              label: 'Pre-Scan State',
              value: connectedNodes.some(node => node.preScanFindings) ? 'Complete' : 'Not started',
              sub: 'Live client pre-scan results',
              icon: Search
            },
            {
              label: 'Audit Status',
              value: connectedNodes.length ? 'Monitoring' : 'Awaiting nodes',
              sub: 'Fleet activity status',
              icon: ShieldCheck
            }
          ].map((item, idx) => {
            const Icon = item.icon
            return (
              <div key={idx} className="atlas-card p-5 flex items-start justify-between shadow-atlas bg-white">
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-atlas-muted">
                    {item.label}
                  </span>
                  <div className="text-xl font-bold font-mono text-atlas-navy">{item.value}</div>
                  <div className="text-[11px] text-atlas-lightmuted">{item.sub}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-atlas-bg border border-atlas-border text-atlas-forest">
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Action Dispatch Matrix Bar */}
        <div className="bg-white border border-atlas-border rounded-xl p-5 shadow-atlas flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => selectAllNodes(!allSelected)}
              className="w-4 h-4 rounded text-atlas-forest border-atlas-border cursor-pointer accent-emerald-600"
            />
            <div>
              <h3 className="font-bold text-sm text-atlas-navy">
                Batch Dispatch ({selectedCount} Selected)
              </h3>
              <p className="text-[11px] text-atlas-muted">
                Execute synchronized procedures across selected workstations
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleTriggerPreScan}
              disabled={selectedCount === 0 || !assignedOptions.preScanEnabled}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Pre-Scan Selected</span>
            </button>

            <button
              onClick={() => setIsBatchWipeModalOpen(true)}
              disabled={selectedCount === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Batch Wipe Selected</span>
            </button>

            <button
              onClick={handleTriggerBatchRecovery}
              disabled={selectedCount === 0}
              className="atlas-btn-primary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Batch Recovery</span>
            </button>
          </div>
        </div>

        {/* Connected Workstation Nodes Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-atlas-muted">
              Connected Workstations ({connectedNodes.length} Nodes)
            </h2>
            <span className="text-xs text-atlas-muted">
              Select any workstation card to open its device console
            </span>
          </div>

          {connectedNodes.length === 0 ? (
            <div className="bg-white border border-atlas-border rounded-xl p-10 text-center space-y-3">
              <Network className="w-10 h-10 text-atlas-muted opacity-40 mx-auto" />
              <div className="font-bold text-sm text-atlas-navy">Waiting for secondary workstations to connect</div>
              <p className="text-xs text-atlas-muted max-w-md mx-auto">
                Secondary workstations on this local network can join this coordination room using room code{' '}
                <strong className="font-mono text-atlas-forest">{fleetKey}</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedNodes.map(node => (
                <NodeCard
                  key={node.id}
                  node={node}
                  onToggleSelect={() => toggleNodeSelection(node.id)}
                  onOpenEngine={() => selectFleetNodeForEngine(node)}
                  onInspectPreScan={() => setIsPreScanModalOpen(true)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Local Telemetry Drawer */}
        <div className="bg-atlas-navydark rounded-xl p-4 border border-white/10 text-xs font-mono space-y-2">
          <div className="flex items-center justify-between text-atlas-lightmuted border-b border-white/10 pb-2">
            <span className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-atlas-green" />
              <span>Offline Local LAN Telemetry</span>
            </span>
            <span className="text-[10px] text-atlas-green">ws://127.0.0.1:4096 (Active)</span>
          </div>

          <div className="space-y-1 text-[11px] text-white/80 max-h-24 overflow-y-auto">
            {telemetryLog.map((log, i) => (
              <div key={i} className="truncate">{log}</div>
            ))}
          </div>
        </div>
      </main>

      {/* Modals */}
      <PreScanModal
        isOpen={isPreScanModalOpen}
        onClose={() => setIsPreScanModalOpen(false)}
        nodes={connectedNodes.filter(n => n.selected)}
      />

      <BatchTriggerModal
        isOpen={isBatchWipeModalOpen}
        onClose={() => setIsBatchWipeModalOpen(false)}
        selectedCount={selectedCount}
        defaultStandard={assignedOptions.wipeStandard}
        onConfirmWipe={handleTriggerBatchWipe}
      />
    </div>
  )
}

export default FleetDashboard
