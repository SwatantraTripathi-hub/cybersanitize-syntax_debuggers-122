import React, { useState } from 'react'
import {
  Network,
  X,
  Key,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react'
import { useCase } from '../context/CaseContext'

export const FleetCreateModal: React.FC = () => {
  const {
    operator,
    updateOperator,
    createFleetWorkspace,
    isFleetCreateModalOpen,
    setIsFleetCreateModalOpen,
    setOrchestrationMode
  } = useCase()

  const [step, setStep] = useState<'name' | 'key-generated' | 'operator'>('name')
  const [workspaceName, setWorkspaceName] = useState('Campus Workstation Decommission Batch A')
  const [targetEstimate, setTargetEstimate] = useState('10 Workstations')
  const [generatedKey, setGeneratedKey] = useState('')
  const [copiedKey, setCopiedKey] = useState(false)

  // Administrator registration details (matching the single-device setup)
  const [adminName, setAdminName] = useState(operator.name)
  const [adminOrg, setAdminOrg] = useState(operator.agency)
  const [adminRole, setAdminRole] = useState(operator.role)
  const [adminBadge, setAdminBadge] = useState(operator.badge)
  const [adminClearance, setAdminClearance] = useState(operator.clearanceLevel)

  if (!isFleetCreateModalOpen) return null

  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceName.trim()) return
    const key = createFleetWorkspace(workspaceName.trim())
    setGeneratedKey(key)
    setStep('key-generated')
  }

  const handleCopyKey = () => {
    navigator.clipboard.writeText(generatedKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleContinueToOperator = () => {
    setStep('operator')
  }

  const handleFinalLaunch = (e: React.FormEvent) => {
    e.preventDefault()
    // Update operator profile
    updateOperator({
      ...operator,
      name: adminName.trim(),
      agency: adminOrg.trim(),
      role: adminRole.trim(),
      badge: adminBadge.trim(),
      clearanceLevel: adminClearance.trim(),
      status: 'VERIFIED',
      lastVerified: new Date().toISOString()
    })

    // Launch multi-device fleet dashboard
    setIsFleetCreateModalOpen(false)
    setStep('name')
    setOrchestrationMode('MULTI')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-atlas-text">
        {/* Header */}
        <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-atlas-navy">
                Create Multi-Device Fleet Workspace
              </h2>
              <p className="text-xs text-atlas-muted">
                Step {step === 'name' ? '1: Workspace Name' : step === 'key-generated' ? '2: Workspace Room Key' : '3: Lead Administrator Registration'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setIsFleetCreateModalOpen(false)
              setStep('name')
            }}
            className="text-atlas-muted hover:text-atlas-navy p-1 rounded-md hover:bg-atlas-border transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {/* STEP 1: Enter Workspace Name */}
          {step === 'name' && (
            <form onSubmit={handleGenerateKey} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-atlas-navy">
                  Fleet Workspace Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g. Engineering Laptop Offboarding - Batch 01"
                  className="w-full px-3 py-2 text-xs border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                />
                <p className="text-[11px] text-atlas-muted">
                  A recognizable project title for all machines in this batch.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-atlas-navy">
                  Estimated Fleet Size
                </label>
                <select
                  value={targetEstimate}
                  onChange={(e) => setTargetEstimate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                >
                  <option value="4 Workstations">Small Cluster (4 - 10 Nodes)</option>
                  <option value="15 Workstations">Medium Lab (15 - 25 Nodes)</option>
                  <option value="40 Workstations">Large Enterprise (30 - 60 Nodes)</option>
                  <option value="100+ Workstations">Data Center Rack (100+ Nodes)</option>
                </select>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Devices pair over local network using an ephemeral room key.</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-atlas-border">
                <button
                  type="button"
                  onClick={() => setIsFleetCreateModalOpen(false)}
                  className="atlas-btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="atlas-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Generate Workspace Key</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Show Generated Workspace Key */}
          {step === 'key-generated' && (
            <div className="space-y-5 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <Key className="w-6 h-6" />
              </div>

              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-atlas-muted">
                  Active Fleet Workspace Key
                </span>
                <div className="my-2 p-3 bg-atlas-bg border-2 border-dashed border-atlas-forest/40 rounded-xl flex items-center justify-center gap-3">
                  <span className="text-2xl font-mono font-black text-atlas-forest tracking-wider">
                    {generatedKey}
                  </span>
                  <button
                    onClick={handleCopyKey}
                    className="p-1.5 rounded-md hover:bg-atlas-border text-atlas-muted hover:text-atlas-navy transition"
                    title="Copy Workspace Key"
                  >
                    {copiedKey ? <Check className="w-5 h-5 text-atlas-forest" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-atlas-muted">
                  Workspace: <strong>{workspaceName}</strong>
                </p>
              </div>

              <div className="bg-atlas-bg border border-atlas-border rounded-lg p-3 text-left text-xs text-atlas-muted space-y-1">
                <strong className="text-atlas-navy block">How connected devices join:</strong>
                <ol className="list-decimal pl-4 space-y-0.5 text-[11px]">
                  <li>Connect target laptops to the same local Ethernet switch or offline Wi-Fi.</li>
                  <li>Launch CyberSanitize in Client Node mode on each target laptop.</li>
                  <li>Enter the key <strong>{generatedKey}</strong> to authenticate.</li>
                </ol>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-atlas-border">
                <button
                  onClick={handleContinueToOperator}
                  className="w-full atlas-btn-primary py-2.5 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <span>Register Administrator & Launch Fleet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Register Administrator Details (Same as single-device case modal) */}
          {step === 'operator' && (
            <form onSubmit={handleFinalLaunch} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-atlas-border">
                <UserCheck className="w-4 h-4 text-atlas-forest" />
                <span className="text-xs font-bold text-atlas-navy uppercase tracking-wider">
                  Lead Systems Administrator & Organization Credentials
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-atlas-navy">
                    Administrator Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-atlas-border rounded-md focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-atlas-navy">
                    Organization / Unit <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={adminOrg}
                    onChange={(e) => setAdminOrg(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-atlas-border rounded-md focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-atlas-navy">
                    Operational Role
                  </label>
                  <input
                    type="text"
                    value={adminRole}
                    onChange={(e) => setAdminRole(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-atlas-border rounded-md focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-atlas-navy">
                    Badge / Employee ID
                  </label>
                  <input
                    type="text"
                    value={adminBadge}
                    onChange={(e) => setAdminBadge(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-atlas-border rounded-md focus:border-atlas-forest focus:outline-none bg-atlas-bg font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-atlas-navy">
                  Clearance / Authorization Level
                </label>
                <input
                  type="text"
                  value={adminClearance}
                  onChange={(e) => setAdminClearance(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-atlas-border rounded-md focus:border-atlas-forest focus:outline-none bg-atlas-bg font-mono"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-atlas-muted bg-atlas-bg p-2.5 rounded-lg border border-atlas-border">
                <span>Binding Fleet Key: <strong className="font-mono text-atlas-forest">{generatedKey}</strong></span>
                <span className="text-[10px] text-atlas-forest font-semibold">ED25519 COMPLIANCE READY</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-atlas-border">
                <button
                  type="button"
                  onClick={() => setStep('key-generated')}
                  className="atlas-btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="atlas-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Launch Connected Fleet Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default FleetCreateModal
