import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Shield, 
  FolderPlus, 
  UserCheck, 
  Briefcase, 
  X, 
  Check, 
  Key,
  ShieldCheck,
  Upload,
  Download,
  AlertCircle,
  FileCode,
  ArrowRight,
  Sparkles
} from 'lucide-react'
import { useCase, CaseRecord, OperatorProfile } from '../context/CaseContext'

export const CaseModal: React.FC = () => {
  const navigate = useNavigate()
  const {
    operator,
    activeCase,
    caseList,
    updateOperator,
    verifyOperator,
    setActiveCase,
    createCase,
    importCase,
    exportCase,
    isCaseModalOpen,
    setIsCaseModalOpen,
    setOrchestrationMode
  } = useCase()

  const [activeTab, setActiveTab] = useState<'cases' | 'new-case' | 'import' | 'operator'>('cases')

  // Form states for new workspace
  const [newCaseId, setNewCaseId] = useState(`WS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`)
  const [newTitle, setNewTitle] = useState('')
  const [newEvidenceTag, setNewEvidenceTag] = useState('')
  const [newAuthorizer, setNewAuthorizer] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newClassification, setNewClassification] = useState('ENTERPRISE CONFIDENTIAL / COMPLIANT')

  // Form states for operator credentials
  const [opId, setOpId] = useState(operator.operatorId)
  const [opName, setOpName] = useState(operator.name)
  const [opRole, setOpRole] = useState(operator.role)
  const [opAgency, setOpAgency] = useState(operator.agency)
  const [opBadge, setOpBadge] = useState(operator.badge)
  const [opClearance, setOpClearance] = useState(operator.clearanceLevel || 'LEVEL 4 — CHIEF SYSTEMS ADMINISTRATOR')
  const [operatorSaved, setOperatorSaved] = useState(false)

  // Import state
  const [jsonInput, setJsonInput] = useState('')
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isCaseModalOpen) return null

  const handleSelectCaseAndOpen = (c: CaseRecord) => {
    setActiveCase(c)
    setIsCaseModalOpen(false)
    setOrchestrationMode('SINGLE')
    navigate('/')
  }

  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCaseId.trim() || !newTitle.trim()) return

    const caseData: CaseRecord = {
      caseId: newCaseId.trim().toUpperCase(),
      title: newTitle.trim(),
      evidenceTag: newEvidenceTag.trim() || `AST-${Math.floor(100 + Math.random() * 900)}`,
      authorizingOfficer: newAuthorizer.trim() || 'Chief Information Security Officer (CISO)',
      date: new Date().toISOString().split('T')[0],
      notes: newNotes.trim() || 'Enterprise storage triage & compliance audit under NIST SP 800-88 & ISO/IEC 27037.',
      classification: newClassification,
      status: 'ACTIVE',
      mode: 'SINGLE'
    }

    createCase(caseData)
    setIsCaseModalOpen(false)
    setOrchestrationMode('SINGLE')
    navigate('/')
  }

  const handleSaveOperator = (e: React.FormEvent) => {
    e.preventDefault()
    const updated: OperatorProfile = {
      operatorId: opId.trim() || 'ADMIN-101',
      name: opName.trim() || 'Lead Systems Admin',
      role: opRole.trim() || 'Chief Security Engineer',
      agency: opAgency.trim() || 'Enterprise Systems & Security Operations',
      badge: opBadge.trim() || 'SEC-001',
      clearanceLevel: opClearance.trim() || 'LEVEL 4 — CHIEF SYSTEMS ADMINISTRATOR',
      status: 'VERIFIED',
      lastVerified: new Date().toISOString(),
      tokenHash: operator.tokenHash || 'ENCLAVE-ED25519-7F3A-89C1-VERIFIED'
    }
    updateOperator(updated)
    setOperatorSaved(true)
    setTimeout(() => setOperatorSaved(false), 2500)
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string)
        const result = importCase(parsed)
        setImportFeedback(result)
        if (result.success) {
          setTimeout(() => {
            setIsCaseModalOpen(false)
            setOrchestrationMode('SINGLE')
            navigate('/')
          }, 1200)
        }
      } catch (err: any) {
        setImportFeedback({ success: false, message: `JSON Parse Error: ${err.message}` })
      }
    }
    reader.readAsText(file)
  }

  const handlePasteImport = () => {
    if (!jsonInput.trim()) return
    try {
      const parsed = JSON.parse(jsonInput)
      const result = importCase(parsed)
      setImportFeedback(result)
      if (result.success) {
        setTimeout(() => {
          setIsCaseModalOpen(false)
          setOrchestrationMode('SINGLE')
          navigate('/')
        }, 1200)
      }
    } catch (err: any) {
      setImportFeedback({ success: false, message: `JSON Parse Error: ${err.message}` })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] text-atlas-text">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest shadow-xs">
              <Briefcase className="w-5 h-5 text-atlas-forest" />
            </div>
            <div>
              <h2 className="font-bold text-base text-atlas-navy">
                Workspace Setup & Task Registry
              </h2>
              <p className="text-xs text-atlas-muted">
                Task-Based Access Control (TBAC) & ISO/IEC 27037 Compliance Binding
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsCaseModalOpen(false)}
            className="text-atlas-muted hover:text-atlas-navy p-1 rounded-md hover:bg-atlas-border transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-atlas-border bg-white flex gap-6 text-xs font-semibold">
          {[
            { id: 'cases', label: 'Recent Workspaces', icon: Briefcase },
            { id: 'new-case', label: 'Create Workspace', icon: FolderPlus },
            { id: 'import', label: 'Import Dossier (.json)', icon: Upload },
            { id: 'operator', label: 'Administrator Profile', icon: UserCheck }
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 flex items-center gap-2 border-b-2 transition ${
                  isActive
                    ? 'border-atlas-forest text-atlas-forest font-bold'
                    : 'border-transparent text-atlas-muted hover:text-atlas-navy'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* TAB 1: Recent Workspaces */}
          {activeTab === 'cases' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-atlas-muted">
                  Saved Workspaces ({caseList.length})
                </span>
                <button
                  onClick={() => setActiveTab('new-case')}
                  className="atlas-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Register New Workspace</span>
                </button>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {caseList.map((c) => {
                  const isCurrent = c.caseId === activeCase.caseId
                  return (
                    <div
                      key={c.caseId}
                      className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'border-atlas-bordergreen bg-atlas-lightgreen/40 shadow-xs'
                          : 'border-atlas-border hover:border-atlas-borderhover bg-white'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-atlas-forest bg-white px-2 py-0.5 rounded border border-atlas-bordergreen">
                            {c.caseId}
                          </span>
                          <span className="text-[11px] font-mono text-atlas-muted bg-atlas-bg px-2 py-0.5 rounded border border-atlas-border">
                            {c.evidenceTag}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-atlas-forest flex items-center gap-1">
                              <Check className="w-3 h-3" /> ACTIVE
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-atlas-navy">{c.title}</h4>
                        <p className="text-xs text-atlas-muted">
                          Authorizer: {c.authorizingOfficer} • Date: {c.date} • {c.classification}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => exportCase(c)}
                          className="p-2 rounded-lg border border-atlas-border hover:bg-atlas-bg text-atlas-muted hover:text-atlas-navy transition"
                          title="Export Workspace JSON"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSelectCaseAndOpen(c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                            isCurrent
                              ? 'bg-atlas-forest text-white shadow-xs'
                              : 'bg-white border border-atlas-border text-atlas-navy hover:bg-atlas-bg'
                          }`}
                        >
                          <span>{isCurrent ? 'Open Workspace' : 'Select & Open'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Register New Workspace */}
          {activeTab === 'new-case' && (
            <form onSubmit={handleCreateCase} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">
                    Workspace / Task ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newCaseId}
                    onChange={(e) => setNewCaseId(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">
                    Asset Reference Tag <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newEvidenceTag}
                    onChange={(e) => setNewEvidenceTag(e.target.value)}
                    placeholder="e.g. AST-NVME-01 or LAB-HDD-32"
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-atlas-navy">
                  Workspace Title / Mission <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Server Storage Decommissioning & Data Retrieval Audit"
                  className="w-full px-3 py-2 border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">
                    Authorizing Systems Administrator
                  </label>
                  <input
                    type="text"
                    value={newAuthorizer}
                    onChange={(e) => setNewAuthorizer(e.target.value)}
                    placeholder="e.g. Chief Information Security Officer (CISO)"
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">
                    Compliance Classification
                  </label>
                  <select
                    value={newClassification}
                    onChange={(e) => setNewClassification(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                  >
                    <option value="ENTERPRISE CONFIDENTIAL / COMPLIANT">ENTERPRISE CONFIDENTIAL / COMPLIANT</option>
                    <option value="NIST SP 800-88 REV 1 VERIFIED">NIST SP 800-88 REV 1 VERIFIED</option>
                    <option value="ISO/IEC 27037:2012 COMPLIANT">ISO/IEC 27037:2012 COMPLIANT</option>
                    <option value="RESTRICTED / REGULATORY AUDIT">RESTRICTED / REGULATORY AUDIT</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-atlas-navy">
                  Operational Notes & Task Objectives
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Describe scope of work, target storage devices, and retention parameters..."
                  className="w-full px-3 py-2 border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-atlas-border">
                <button
                  type="button"
                  onClick={() => setActiveTab('cases')}
                  className="atlas-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="atlas-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Create & Launch Workspace</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Import Dossier (.json) */}
          {activeTab === 'import' && (
            <div className="space-y-4 text-xs">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-atlas-border hover:border-atlas-forest/60 bg-atlas-bg rounded-xl p-6 text-center cursor-pointer transition space-y-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,.case.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-atlas-lightgreen text-atlas-forest flex items-center justify-center mx-auto">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-atlas-navy">Click to browse Workspace Dossier (.json)</h4>
                  <p className="text-[11px] text-atlas-muted mt-0.5">
                    Supports JSON archives created by CyberSanitize
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-atlas-navy">Or Paste Raw JSON Payload:</label>
                <textarea
                  rows={4}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='{"caseMeta": { "caseId": "WS-2026-9999", "title": "..." }}'
                  className="w-full px-3 py-2 border border-atlas-border rounded-lg font-mono text-[11px] bg-atlas-bg focus:border-atlas-forest focus:outline-none"
                />
                <button
                  onClick={handlePasteImport}
                  className="atlas-btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Validate & Ingest JSON
                </button>
              </div>

              {importFeedback && (
                <div
                  className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
                    importFeedback.success
                      ? 'bg-atlas-lightgreen border-atlas-bordergreen text-atlas-forest font-bold'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {importFeedback.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{importFeedback.message}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Administrator Profile */}
          {activeTab === 'operator' && (
            <form onSubmit={handleSaveOperator} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">Administrator ID</label>
                  <input
                    type="text"
                    required
                    value={opId}
                    onChange={(e) => setOpId(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">Operational Role</label>
                  <input
                    type="text"
                    value={opRole}
                    onChange={(e) => setOpRole(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">Organization / Enterprise Unit</label>
                  <input
                    type="text"
                    value={opAgency}
                    onChange={(e) => setOpAgency(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">Badge / Employee ID</label>
                  <input
                    type="text"
                    value={opBadge}
                    onChange={(e) => setOpBadge(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-atlas-navy">Clearance / Authorization Level</label>
                  <input
                    type="text"
                    value={opClearance}
                    onChange={(e) => setOpClearance(e.target.value)}
                    className="w-full px-3 py-2 border border-atlas-border rounded-lg bg-atlas-bg font-mono"
                  />
                </div>
              </div>

              <div className="bg-atlas-bg border border-atlas-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-atlas-muted block">Asymmetric Hardware Enclave:</span>
                  <span className="font-mono text-[11px] font-bold text-atlas-forest">{operator.tokenHash}</span>
                </div>
                <button
                  type="button"
                  onClick={verifyOperator}
                  className="atlas-btn-secondary px-3 py-1 text-xs"
                >
                  Re-Verify Enclave
                </button>
              </div>

              {operatorSaved && (
                <div className="p-2.5 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen text-atlas-forest font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Administrator credentials updated and cryptographically bound!</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-atlas-border">
                <button
                  type="submit"
                  className="atlas-btn-primary px-5 py-2 text-xs font-bold"
                >
                  Save Administrator Profile
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default CaseModal
