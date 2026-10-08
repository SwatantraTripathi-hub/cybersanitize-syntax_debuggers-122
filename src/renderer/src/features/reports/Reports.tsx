import React, { useState, useEffect, useRef } from 'react'
import {
  FileText, Download, ShieldCheck, Eye, Trash2, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Cpu, Upload, Package, FolderOpen, ExternalLink, QrCode,
  Smartphone, Globe, Copy, Check
} from 'lucide-react'
import { useCase } from '../../context/CaseContext'

interface ReportItem {
  id: string
  path: string
  verifierHtmlPath?: string
  hasVerifierHtml?: boolean
  title: string
  certRef: string
  caseId: string
  operatorId: string
  date: string
  qrPayload?: string
  verifyUrl?: string
  systemHost?: string
  nodeId?: string
  isFleetNode?: boolean
  isFleetCluster?: boolean
}

type TabKey = 'generate' | 'verify' | 'list'

export default function Reports() {
  const {
    activeCase,
    operator,
    caseList,
    importCase,
    orchestrationMode,
    connectedNodes,
    fleetKey,
    fleetWorkspaceName
  } = useCase()
  const [activeTab, setActiveTab] = useState<TabKey>('list')
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [generatedPath, setGeneratedPath] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<any>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [chainStatus, setChainStatus] = useState<any>(null)
  const [isCheckingChain, setIsCheckingChain] = useState(false)
  const [isExportingBundle, setIsExportingBundle] = useState(false)
  const [bundleResult, setBundleResult] = useState<any>(null)
  const [caseFilter, setCaseFilter] = useState<string>(activeCase.caseId)
  const [systemFilter, setSystemFilter] = useState<string>('ALL')
  const [isGeneratingFleet, setIsGeneratingFleet] = useState(false)
  const [verifyMode, setVerifyMode] = useState<'file' | 'airgap'>('file')
  const [airGapInput, setAirGapInput] = useState<string>('')
  const [airGapResult, setAirGapResult] = useState<any>(null)
  const [isVerifyingAirGap, setIsVerifyingAirGap] = useState(false)
  const [selectedQrReport, setSelectedQrReport] = useState<ReportItem | null>(null)
  const [qrModalTab, setQrModalTab] = useState<'url' | 'airgap'>('url')
  const [qrModalDataUrl, setQrModalDataUrl] = useState<string | null>(null)
  const [copiedToast, setCopiedToast] = useState(false)
  const [copiedUrlToast, setCopiedUrlToast] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const loadQrForReport = async (r: ReportItem, mode: 'url' | 'airgap') => {
    setQrModalDataUrl(null)
    if (window.api?.getQrDataUrl) {
      const payloadToEncode = mode === 'url'
        ? r.verifyUrl
        : (r.qrPayload || r.certRef)
      const url = await window.api.getQrDataUrl(payloadToEncode, { width: 320, margin: 2 })
      setQrModalDataUrl(url)
    }
  }

  const handleOpenQrModal = async (r: ReportItem) => {
    setSelectedQrReport(r)
    setQrModalTab('url')
    await loadQrForReport(r, 'url')
  }

  const handleSwitchQrTab = async (mode: 'url' | 'airgap') => {
    if (!selectedQrReport) return
    setQrModalTab(mode)
    await loadQrForReport(selectedQrReport, mode)
  }

  const handleVerifyAirGap = async (payloadToTest?: string) => {
    const input = payloadToTest !== undefined ? payloadToTest : airGapInput
    if (!input.trim() || !window.api?.verifyAirGapPayload) return
    setIsVerifyingAirGap(true)
    setAirGapResult(null)
    try {
      const res = await window.api.verifyAirGapPayload(input)
      setAirGapResult(res)
    } catch (e: any) {
      setAirGapResult({ isValid: false, errors: [e.message] })
    }
    setIsVerifyingAirGap(false)
  }

  useEffect(() => { setCaseFilter(activeCase.caseId) }, [activeCase.caseId])

  useEffect(() => {
    if (window.api?.getAuditLogs) {
      window.api.getAuditLogs({ limit: 100, caseId: caseFilter !== 'ALL' ? caseFilter : undefined })
        .then((data: any[]) => setAuditLogs(data || []))
        .catch(console.error)
    }
    if (window.api?.listReports) {
      window.api.listReports(caseFilter !== 'ALL' ? caseFilter : undefined)
        .then((data: any[]) => setReports(data || []))
        .catch(console.error)
    }
  }, [caseFilter])

  const generateReport = async (log: any) => {
    if (!window.api?.generateReport) return
    setLoadingId(log.id)
    setGeneratedPath(null)
    try {
      const filePath = await window.api.generateReport(log.id)
      setGeneratedPath(filePath)
      // Refresh reports list
      const updated = await window.api.listReports(caseFilter !== 'ALL' ? caseFilter : undefined)
      setReports(updated || [])
      setActiveTab('list')
    } catch (e) { console.error(e) }
    setLoadingId(null)
  }

  const handleGenerateFleetReport = async () => {
    if (!window.api?.generateFleetReport) return
    setIsGeneratingFleet(true)
    try {
      const filePath = await window.api.generateFleetReport({
        fleetKey,
        workspaceName: fleetWorkspaceName,
        operatorId: operator.operatorId,
        caseId: activeCase.caseId,
        nodes: connectedNodes
      })
      setGeneratedPath(filePath)
      const updated = await window.api.listReports(caseFilter !== 'ALL' ? caseFilter : undefined)
      setReports(updated || [])
      setActiveTab('list')
    } catch (e: any) {
      console.error('Fleet report generation failed:', e)
    }
    setIsGeneratingFleet(false)
  }

  const filteredReports = reports.filter(r => {
    if (systemFilter === 'LOCAL' && (r.isFleetNode || r.isFleetCluster)) return false
    if (systemFilter !== 'ALL' && systemFilter !== 'LOCAL') {
      const match = r.nodeId === systemFilter || r.systemHost?.includes(systemFilter)
      if (!match) return false
    }
    return true
  })

  const filteredAuditLogs = auditLogs.filter(log => {
    if (systemFilter === 'LOCAL' && (log.details?.fleetCluster || log.target?.includes('Fleet Node') || (log.details?.nodeId && log.details?.nodeId !== 'LOCAL'))) return false
    if (systemFilter !== 'ALL' && systemFilter !== 'LOCAL') {
      const match = log.details?.nodeId === systemFilter || log.details?.systemHost === systemFilter || log.target?.includes(systemFilter)
      if (!match) return false
    }
    return true
  })

  const handleVerifyChain = async () => {
    if (!window.api?.verifyAuditChain) return
    setIsCheckingChain(true)
    const result = await window.api.verifyAuditChain()
    setChainStatus(result)
    setIsCheckingChain(false)
  }

  const handleVerifyFile = async (filePath?: string) => {
    if (!window.api?.verifyReportFile) return
    setIsVerifying(true)
    setVerifyResult(null)
    const result = await window.api.verifyReportFile(filePath)
    setVerifyResult(result)
    setIsVerifying(false)
  }

  const handleExportBundle = async () => {
    if (!window.api?.exportForensicBundle) return
    setIsExportingBundle(true)
    setBundleResult(null)
    const res = await window.api.exportForensicBundle(caseFilter !== 'ALL' ? caseFilter : undefined)
    setBundleResult(res)
    setIsExportingBundle(false)
  }

  const handleDropDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDropDragLeave = () => setIsDragging(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = (file as any).path?.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
      await handleVerifyFile((file as any).path)
    } else if (ext === 'forensic' || ext === 'csev') {
      setIsVerifying(true)
      setVerifyResult(null)
      const res = await window.api.importVerifyBundle((file as any).path)
      setVerifyResult({ ...res, isBundleResult: true })
      if (res && res.success && res.isValid && res.caseRecord) {
        importCase(res.caseRecord)
        if (res.caseId && res.caseId !== 'ALL') {
          setCaseFilter(res.caseId)
        }
        if (window.api?.listReports) {
          const updated = await window.api.listReports(res.caseId && res.caseId !== 'ALL' ? res.caseId : undefined)
          setReports(updated || [])
        }
      }
      setIsVerifying(false)
    } else {
      setVerifyResult({ success: false, errors: [`Unsupported file type: .${ext}. Drop a .pdf certificate or .forensic bundle.`] })
    }
  }

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'list', label: 'Certificates', icon: <FileText className="w-4 h-4" /> },
    { key: 'generate', label: 'Generate Certificate', icon: <Download className="w-4 h-4" /> },
    { key: 'verify', label: 'Verify & Authenticate', icon: <ShieldCheck className="w-4 h-4" /> }
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 shrink-0 pb-3 border-b border-atlas-border">
        <div>
          <h1 className="text-2xl font-bold text-atlas-navy tracking-tight">Court-Admissible Reports & Certificates</h1>
          <p className="text-xs text-atlas-muted mt-1">ISO/IEC 27037 | Sec 65B IEA | Sec 63 BSA 2023 — Ed25519-sealed PDF certificates with QR verification</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className="bg-white border border-atlas-border rounded-lg px-3 py-2 text-xs text-atlas-forest font-bold outline-none">
            <option value={activeCase.caseId}>Case: {activeCase.caseId} (Active)</option>
            {caseList.filter(c => c.caseId !== activeCase.caseId).map(c => (
              <option key={c.caseId} value={c.caseId}>Case: {c.caseId}</option>
            ))}
            <option value="ALL">All Cases</option>
          </select>
          {(orchestrationMode === 'MULTI' || connectedNodes.length > 0) && (
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="bg-white border border-atlas-border rounded-lg px-3 py-2 text-xs text-atlas-forest font-bold outline-none"
            >
              <option value="ALL">All Systems (Cluster View)</option>
              <option value="LOCAL">Local Workstation Only</option>
              {connectedNodes.map(node => (
                <option key={node.id} value={node.id}>Node: {node.hostname} ({node.ip})</option>
              ))}
            </select>
          )}
          {(orchestrationMode === 'MULTI' || connectedNodes.length > 0) && (
            <button
              onClick={handleGenerateFleetReport}
              disabled={isGeneratingFleet}
              className="flex items-center gap-1.5 px-3 py-2 bg-atlas-forest hover:bg-atlas-forestDark text-white font-semibold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${isGeneratingFleet ? 'animate-spin' : ''}`} />
              {isGeneratingFleet ? 'Sealing Cluster...' : 'Seal Fleet Cluster Cert'}
            </button>
          )}
          <button
            onClick={async () => {
              if (!window.api?.importVerifyBundle) return
              setIsVerifying(true)
              setVerifyResult(null)
              const res = await window.api.importVerifyBundle()
              if (res) {
                setVerifyResult({ ...res, isBundleResult: true })
                if (res.success && res.isValid && res.caseRecord) {
                  importCase(res.caseRecord)
                  if (res.caseId && res.caseId !== 'ALL') {
                    setCaseFilter(res.caseId)
                  }
                  if (window.api?.listReports) {
                    const updated = await window.api.listReports(res.caseId && res.caseId !== 'ALL' ? res.caseId : undefined)
                    setReports(updated || [])
                  }
                }
              }
              setIsVerifying(false)
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Import .forensic Bundle
          </button>
          <button
            onClick={handleExportBundle}
            disabled={isExportingBundle}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Package className={`w-3.5 h-3.5 ${isExportingBundle ? 'animate-pulse' : ''}`} />
            {isExportingBundle ? 'Packaging...' : 'Export .forensic Bundle'}
          </button>
        </div>
      </div>

      {/* Bundle Result Toast */}
      {bundleResult && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-xs shrink-0 ${bundleResult.success ? 'bg-atlas-emeraldLight border-[#C0EAD6] text-atlas-forest' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <Package className="w-4 h-4 shrink-0" />
          <div className="flex-1 min-w-0">
            {bundleResult.success
              ? <><span className="font-bold">Forensic bundle sealed successfully!</span><span className="font-mono ml-2 text-[10px] break-all">{bundleResult.filePath}</span></>
              : <span className="font-bold">Export failed: {bundleResult.message}</span>
            }
          </div>
          <button onClick={() => setBundleResult(null)} className="text-[10px] underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-atlas-bg border border-atlas-border rounded-xl p-1 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-white text-atlas-forest shadow-sm border border-atlas-border'
                : 'text-atlas-muted hover:text-atlas-navy'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Certificates List */}
      {activeTab === 'list' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* Chain integrity banner */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <button onClick={handleVerifyChain} disabled={isCheckingChain} className="flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg border border-atlas-border bg-white hover:border-atlas-forest text-atlas-forest font-semibold transition">
              <ShieldCheck className={`w-3.5 h-3.5 ${isCheckingChain ? 'animate-spin' : ''}`} />
              {isCheckingChain ? 'Verifying chain...' : 'Verify Audit Chain'}
            </button>
            {chainStatus && (
              <div className={`flex items-center gap-2 text-[11px] font-sans px-3 py-1.5 rounded-lg border ${chainStatus.intact ? 'bg-atlas-emeraldLight border-[#C0EAD6] text-atlas-forest' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {chainStatus.intact
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> <span className="font-bold">{chainStatus.checkedBlocks} blocks — chain intact</span></>
                  : <><XCircle className="w-3.5 h-3.5" /> <span className="font-bold">TAMPERING DETECTED at #{chainStatus.brokenAtId}</span></>
                }
              </div>
            )}
            <button onClick={async () => { const updated = await window.api.listReports(caseFilter !== 'ALL' ? caseFilter : undefined); setReports(updated || []) }} className="ml-auto p-2 text-atlas-forest border border-atlas-border rounded-lg bg-white hover:border-atlas-forest" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-atlas-emeraldLight/40 border border-[#C0EAD6] rounded-xl p-3 text-xs text-atlas-forest flex items-center gap-3 shrink-0">
            <QrCode className="w-4 h-4 shrink-0 text-atlas-forest" />
            <span>
              <strong>LAN Verification Ready:</strong> Scan the certificate QR while connected to the examiner workstation LAN. The local verification authority checks the PDF hash, signature, and case record.
            </span>
          </div>

          {filteredReports.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-atlas-muted">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <div className="font-semibold text-sm">No certificates found matching filter.</div>
              <div className="text-xs mt-1">Use the "Generate Certificate" tab to create court-admissible forensic certificates.</div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto min-h-0">
              <div className="grid gap-3">
                {filteredReports.map(r => (
                  <div key={r.id} className="bg-white border border-atlas-border rounded-xl p-4 flex items-center gap-4 hover:border-atlas-forest transition shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-atlas-emeraldLight flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-atlas-forest" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-atlas-navy text-sm truncate">{r.certRef || r.title}</span>
                        {r.isFleetCluster ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Fleet Cluster Master
                          </span>
                        ) : r.isFleetNode ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Node: {r.systemHost || r.nodeId}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-gray-100 text-gray-700 border border-gray-200">
                            Local Workstation
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-atlas-muted flex gap-3 mt-0.5 flex-wrap">
                        <span>Case: <span className="font-mono text-atlas-forest">{r.caseId}</span></span>
                        <span>Examiner: <span className="font-mono">{r.operatorId}</span></span>
                        <span>{new Date(r.date).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleOpenQrModal(r)}
                        className="p-2 text-atlas-forest border border-atlas-border rounded-lg hover:bg-atlas-bg text-xs"
                        title="View LAN Verification QR"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => window.api.openReport(r.path)}
                        className="p-2 text-atlas-forest border border-atlas-border rounded-lg hover:bg-atlas-bg text-xs"
                        title="Open PDF Certificate"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => window.api.showReportInFolder(r.path)}
                        className="p-2 text-atlas-forest border border-atlas-border rounded-lg hover:bg-atlas-bg text-xs"
                        title="Show in File Explorer (To share outside app)"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const res = await window.api.verifyReportFile(r.path)
                          setVerifyResult(res)
                          setActiveTab('verify')
                        }}
                        className="p-2 text-atlas-forest border border-atlas-border rounded-lg hover:bg-atlas-bg text-xs"
                        title="In-App Cryptographic Audit Check"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Generate Certificate */}
      {activeTab === 'generate' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-auto">
          {generatedPath && (
            <div className="flex items-center gap-3 bg-atlas-emeraldLight border border-[#C0EAD6] rounded-xl px-4 py-3 text-xs text-atlas-forest shrink-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold">Certificate Generated Successfully!</div>
                <div className="font-mono text-[10px] break-all mt-0.5">{generatedPath}</div>
              </div>
              <button onClick={() => window.api.openReport(generatedPath)} className="px-3 py-1.5 bg-atlas-forest text-white font-semibold rounded-lg shrink-0">Open PDF</button>
            </div>
          )}
          <div className="flex-1 bg-white border border-atlas-border rounded-xl overflow-hidden flex flex-col shadow-atlas">
            <div className="p-4 border-b border-atlas-border bg-[#FAFCFB] text-xs font-bold text-atlas-navy">
              Select an audit record to generate a court-admissible PDF certificate
            </div>
            <div className="overflow-auto flex-1">
              {filteredAuditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-atlas-muted text-xs py-12">
                  No audit records found matching the selected filter. Perform a Drive Sanitize, File Recovery, or File Shred operation first.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAFCFB] text-atlas-muted border-b border-atlas-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Block</th>
                      <th className="px-4 py-3 font-semibold">Operation</th>
                      <th className="px-4 py-3 font-semibold">Target</th>
                      <th className="px-4 py-3 font-semibold">Origin Node</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Timestamp</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-atlas-border font-mono">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-atlas-bg transition-colors">
                        <td className="px-4 py-3 font-bold text-atlas-forest">#BLOCK-{log.id}</td>
                        <td className="px-4 py-3 text-atlas-navy font-sans">{log.operation}</td>
                        <td className="px-4 py-3 text-atlas-muted truncate max-w-[200px] font-sans" title={log.target}>{log.target}</td>
                        <td className="px-4 py-3 font-sans">
                          {log.details?.fleetCluster ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              Fleet Cluster
                            </span>
                          ) : log.details?.nodeId && log.details?.nodeId !== 'LOCAL' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {log.details.systemHost || log.details.nodeId}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-gray-100 text-gray-700 border border-gray-200">
                              Local Host
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${log.status === 'COMPLETED' || log.status === 'VERIFIED' ? 'bg-atlas-emeraldLight text-atlas-forest border-[#C0EAD6]' : 'bg-red-50 text-red-700 border-red-200'}`}>{log.status}</span>
                        </td>
                        <td className="px-4 py-3 text-atlas-muted whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => generateReport(log)}
                            disabled={loadingId === log.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-atlas-forest hover:bg-atlas-forestDark text-white rounded-lg text-[11px] font-semibold font-sans transition disabled:opacity-50"
                          >
                            {loadingId === log.id ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating...</> : <><FileText className="w-3 h-3" /> Generate</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Verify & Authenticate */}
      {activeTab === 'verify' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-auto">
          {/* Sub-tab Mode Switcher */}
          <div className="flex gap-2 p-1 bg-atlas-bg border border-atlas-border rounded-xl shrink-0">
            <button
              onClick={() => setVerifyMode('file')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                verifyMode === 'file'
                  ? 'bg-white text-atlas-forest shadow-sm border border-atlas-border'
                  : 'text-atlas-muted hover:text-atlas-navy'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              File Verification (.pdf / .forensic)
            </button>
          </div>

          {verifyMode === 'file' && (
            <>
              {/* Drop Zone */}
              <div
                ref={dropZoneRef}
                onDragOver={handleDropDragOver}
                onDragLeave={handleDropDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer shrink-0 ${
                  isDragging
                    ? 'border-atlas-forest bg-atlas-emeraldLight scale-[1.01]'
                    : 'border-atlas-border bg-[#FAFCFB] hover:border-atlas-forest hover:bg-atlas-emeraldLight'
                }`}
                onClick={() => handleVerifyFile()}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${isDragging ? 'bg-atlas-forest' : 'bg-white border border-atlas-border'}`}>
                  <Upload className={`w-7 h-7 ${isDragging ? 'text-white' : 'text-atlas-forest'}`} />
                </div>
                <div className="font-bold text-atlas-navy text-sm">Drop a Certificate or Forensic Bundle</div>
                <div className="text-xs text-atlas-muted mt-1.5 max-w-sm">
                  Drop a <span className="font-mono font-semibold">.pdf</span> certificate or <span className="font-mono font-semibold">.forensic / .csev</span> bundle here to cryptographically verify its authenticity and chain-of-custody integrity.
                </div>
                <div className="text-xs text-atlas-forest font-semibold mt-3">Click to browse...</div>
              </div>

              {isVerifying && (
                <div className="flex items-center justify-center gap-3 py-8 text-atlas-muted text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin text-atlas-forest" />
                  <span>Verifying cryptographic signatures and hash chain...</span>
                </div>
              )}

              {/* Verify Result */}
              {verifyResult && !isVerifying && (
                <div className={`border rounded-2xl p-6 space-y-4 ${verifyResult.isValid ? 'border-[#C0EAD6] bg-atlas-emeraldLight' : 'border-red-200 bg-red-50'}`}>
                  {/* Status Banner */}
                  <div className={`flex items-center gap-3 text-base font-bold ${verifyResult.isValid ? 'text-atlas-forest' : 'text-red-700'}`}>
                    {verifyResult.isValid
                      ? <><CheckCircle2 className="w-6 h-6" /> VERIFICATION PASSED — Cryptographically Authentic</>
                      : <><XCircle className="w-6 h-6" /> VERIFICATION FAILED — Evidence Integrity Compromised</>
                    }
                  </div>

                  {verifyResult.isBundleResult ? (
                    // Bundle verification results
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Manifest Intact', ok: verifyResult.manifestIntact },
                        { label: 'Hash Chain Intact', ok: verifyResult.chainIntact },
                        { label: 'Bundle Signature', ok: verifyResult.signatureValid }
                      ].map(check => (
                        <div key={check.label} className={`p-3 rounded-xl border text-xs ${check.ok ? 'bg-white border-[#C0EAD6]' : 'bg-white border-red-200'}`}>
                          <div className="flex items-center gap-2 font-bold mb-1">
                            {check.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-atlas-forest" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                            <span className={check.ok ? 'text-atlas-forest' : 'text-red-700'}>{check.label}</span>
                          </div>
                          <span className={`text-[10px] font-semibold ${check.ok ? 'text-atlas-forest' : 'text-red-600'}`}>{check.ok ? 'PASSED' : 'FAILED'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // PDF cert verification results
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Ed25519 Signature', ok: verifyResult.signatureValid },
                        { label: 'SHA-256 Hash Match', ok: verifyResult.hashValid }
                      ].map(check => (
                        <div key={check.label} className={`p-3 rounded-xl border text-xs ${check.ok ? 'bg-white border-[#C0EAD6]' : 'bg-white border-red-200'}`}>
                          <div className="flex items-center gap-2 font-bold mb-1">
                            {check.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-atlas-forest" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                            <span className={check.ok ? 'text-atlas-forest' : 'text-red-700'}>{check.label}</span>
                          </div>
                          <span className={`text-[10px] font-semibold ${check.ok ? 'text-atlas-forest' : 'text-red-600'}`}>{check.ok ? 'PASSED' : 'FAILED'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Metadata details */}
                  {(verifyResult.certRef || verifyResult.caseId || verifyResult.blockCount !== undefined) && (
                    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                      {verifyResult.certRef && (
                        <div className="p-3 rounded-xl bg-white border border-gray-100">
                          <span className="text-atlas-muted block mb-0.5 font-sans">Certificate Reference:</span>
                          <span className="text-atlas-navy font-bold">{verifyResult.certRef}</span>
                        </div>
                      )}
                      {verifyResult.caseId && (
                        <div className="p-3 rounded-xl bg-white border border-gray-100">
                          <span className="text-atlas-muted block mb-0.5 font-sans">Case ID:</span>
                          <span className="text-atlas-forest font-bold">{verifyResult.caseId}</span>
                        </div>
                      )}
                      {verifyResult.blockCount !== undefined && (
                        <div className="p-3 rounded-xl bg-white border border-gray-100">
                          <span className="text-atlas-muted block mb-0.5 font-sans">Total Audit Blocks:</span>
                          <span className="text-atlas-navy font-bold">{verifyResult.blockCount}</span>
                        </div>
                      )}
                      {verifyResult.publicKey && (
                        <div className="p-3 rounded-xl bg-white border border-gray-100">
                          <span className="text-atlas-muted block mb-0.5 font-sans">Issuer Public Key:</span>
                          <span className="text-atlas-navy break-all">{verifyResult.publicKey?.slice(0, 32)}...</span>
                        </div>
                      )}
                      {verifyResult.actualHash && (
                        <div className="p-3 rounded-xl bg-white border border-gray-100 col-span-2">
                          <span className="text-atlas-muted block mb-0.5 font-sans">Document SHA-256:</span>
                          <span className="text-atlas-navy break-all">{verifyResult.actualHash}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error list */}
                  {verifyResult.errors && verifyResult.errors.length > 0 && (
                    <div className="space-y-1.5">
                      {verifyResult.errors.map((e: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-white border border-red-100 rounded-lg px-3 py-2 font-mono">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => setVerifyResult(null)} className="text-xs text-atlas-muted underline">Clear result</button>
                </div>
              )}
            </>
          )}

          {verifyMode === 'airgap' && (
            <div className="space-y-4">
              <div className="bg-atlas-emeraldLight/40 border border-[#C0EAD6] rounded-xl p-4 text-xs text-atlas-forest flex items-start gap-3">
                <QrCode className="w-5 h-5 shrink-0 text-atlas-forest mt-0.5" />
                <div>
                  <div className="font-bold text-sm text-atlas-navy">100% Air-Gap Offline Verification</div>
                  <div className="text-atlas-muted mt-0.5 leading-relaxed">
                    Paste text scanned by any smartphone camera in <strong>Airplane Mode</strong> (zero LAN, zero internet), JSON envelopes, or evidence audit manifests. The app computes SHA-256 bound evidence digests and mathematically checks the Sovereign Ed25519 signature.
                  </div>
                </div>
              </div>

              <div className="bg-white border border-atlas-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-atlas-navy">Scanned QR Payload or Raw Attestation Text:</label>
                  <button
                    onClick={async () => {
                      try {
                        const txt = await navigator.clipboard.readText()
                        if (txt) {
                          setAirGapInput(txt)
                          handleVerifyAirGap(txt)
                        }
                      } catch (_) {}
                    }}
                    className="text-xs font-semibold text-atlas-forest hover:underline"
                  >
                    Paste from Clipboard
                  </button>
                </div>
                <textarea
                  value={airGapInput}
                  onChange={(e) => setAirGapInput(e.target.value)}
                  placeholder="Paste scanned QR text or JSON attestation here...&#10;Example:&#10;CYBERSANITIZE AIR-GAP FORENSIC ATTESTATION&#10;Cert-Ref: CERT-2026-0001-...&#10;Case-ID: CASE-2026-0842&#10;Pre-SHA256: ...&#10;Signature: ..."
                  className="w-full h-32 p-3 font-mono text-xs border border-atlas-border rounded-lg outline-none focus:border-atlas-forest bg-[#FAFCFB] resize-y"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerifyAirGap()}
                    disabled={isVerifyingAirGap || !airGapInput.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-atlas-forest hover:bg-atlas-forestDark text-white font-semibold text-xs rounded-lg transition disabled:opacity-50 shadow-sm"
                  >
                    <ShieldCheck className={`w-4 h-4 ${isVerifyingAirGap ? 'animate-spin' : ''}`} />
                    {isVerifyingAirGap ? 'Verifying Air-Gap Signature...' : 'Verify Air-Gap Cryptographic Signature'}
                  </button>
                  <button
                    onClick={() => { setAirGapInput(''); setAirGapResult(null); }}
                    className="px-3 py-2 border border-atlas-border hover:bg-atlas-bg text-atlas-muted text-xs rounded-lg transition"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Air-Gap Verification Result */}
              {airGapResult && (
                <div className={`border rounded-2xl p-6 space-y-4 shadow-sm ${airGapResult.isValid ? 'border-[#C0EAD6] bg-atlas-emeraldLight' : 'border-red-200 bg-red-50'}`}>
                  <div className={`flex items-center gap-3 text-base font-bold ${airGapResult.isValid ? 'text-atlas-forest' : 'text-red-700'}`}>
                    {airGapResult.isValid
                      ? <><CheckCircle2 className="w-6 h-6" /> AIR-GAP ATTESTATION AUTHENTICATED — Ed25519 Verified</>
                      : <><XCircle className="w-6 h-6" /> VERIFICATION FAILED — Signature or Evidence Mismatch</>
                    }
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-white border border-[#C0EAD6]">
                      <div className="text-[10px] uppercase font-bold text-atlas-muted">Signature Validity</div>
                      <div className={`text-xs font-bold mt-1 ${airGapResult.signatureValid ? 'text-atlas-forest' : 'text-red-600'}`}>
                        {airGapResult.signatureValid ? 'Ed25519 Valid' : 'Invalid Signature'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#C0EAD6]">
                      <div className="text-[10px] uppercase font-bold text-atlas-muted">Bound Evidence Digest</div>
                      <div className={`text-xs font-bold mt-1 ${airGapResult.digestValid ? 'text-atlas-forest' : 'text-red-600'}`}>
                        {airGapResult.digestValid ? 'SHA-256 Matched' : 'Digest Mismatch'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-[#C0EAD6]">
                      <div className="text-[10px] uppercase font-bold text-atlas-muted">Admissibility Mandate</div>
                      <div className="text-xs font-bold text-atlas-forest mt-1">Sec 65B / Sec 63 BSA</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                    <div className="p-3 rounded-xl bg-white border border-gray-100">
                      <span className="text-atlas-muted block mb-0.5 font-sans">Certificate Reference:</span>
                      <span className="text-atlas-navy font-bold">{airGapResult.certRef}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-gray-100">
                      <span className="text-atlas-muted block mb-0.5 font-sans">Case Reference:</span>
                      <span className="text-atlas-forest font-bold">{airGapResult.caseId} {airGapResult.tagId ? `(Tag: ${airGapResult.tagId})` : ''}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-gray-100 col-span-2">
                      <span className="text-atlas-muted block mb-0.5 font-sans">Investigation Title / Target:</span>
                      <span className="text-atlas-navy font-bold">{airGapResult.title || 'Storage Device Sanitization'} | {airGapResult.target}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-gray-100 col-span-2">
                      <span className="text-atlas-muted block mb-0.5 font-sans">Pre-Operation SHA-256:</span>
                      <span className="text-atlas-muted break-all">{airGapResult.preHash}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-gray-100 col-span-2">
                      <span className="text-atlas-muted block mb-0.5 font-sans">Post-Operation / Acquisition SHA-256:</span>
                      <span className="text-atlas-forest font-bold break-all">{airGapResult.postHash}</span>
                    </div>
                    {airGapResult.publicKey && (
                      <div className="p-3 rounded-xl bg-white border border-gray-100 col-span-2">
                        <span className="text-atlas-muted block mb-0.5 font-sans">Sovereign Enclave Public Key:</span>
                        <span className="text-atlas-navy break-all">{airGapResult.publicKey}</span>
                      </div>
                    )}
                  </div>

                  {airGapResult.errors && airGapResult.errors.length > 0 && (
                    <div className="space-y-1.5">
                      {airGapResult.errors.map((e: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-white border border-red-100 rounded-lg px-3 py-2 font-mono">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => setAirGapResult(null)} className="text-xs text-atlas-muted underline">Clear result</button>
                </div>
              )}
            </div>
          )}

          {/* Footer guidance */}
          <div className="bg-white border border-atlas-border rounded-xl p-4 text-xs text-atlas-muted shrink-0">
            <div className="font-bold text-atlas-navy mb-2 flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-atlas-forest" /> How Verification Works</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><span className="font-semibold text-atlas-navy block">PDF Certificate</span>The PDF is hashed with SHA-256 and the hash is verified against the stored Sovereign Ed25519 Enclave signature. Any byte-level modification is detected.</div>
              <div><span className="font-semibold text-atlas-navy block">LAN QR Verification</span>The QR code opens the local verification authority, which checks the certificate PDF hash, Ed25519 signature, and case-bound evidence digest.</div>
              <div><span className="font-semibold text-atlas-navy block">Audit Chain</span>Every audit block's prev_hash must match the previous block's entry_hash, forming an unbreakable forward-integrity chain.</div>
            </div>
          </div>
        </div>
      )}

      {/* Air-Gap / Instant Camera QR Modal */}
      {selectedQrReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-atlas-border rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-atlas-emeraldLight text-atlas-forest border-[#C0EAD6]">
                    Sovereign Ed25519 Verified
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-blue-50 text-blue-700 border-blue-200">
                    Authority Port 3847
                  </span>
                </div>
                <h3 className="font-bold text-lg text-atlas-navy mt-1.5">{selectedQrReport.certRef}</h3>
                <p className="text-xs text-atlas-muted">Case: <span className="font-mono text-atlas-forest font-semibold">{selectedQrReport.caseId}</span> &bull; Examiner: <span className="font-mono">{selectedQrReport.operatorId}</span></p>
              </div>
              <button
                onClick={() => setSelectedQrReport(null)}
                className="text-atlas-muted hover:text-atlas-navy text-2xl font-bold p-1 leading-none rounded-lg hover:bg-gray-100 transition"
              >
                &times;
              </button>
            </div>

            {/* Segmented Mode Selector */}
            <div className="grid grid-cols-2 p-1 bg-gray-100/80 rounded-xl gap-1 shrink-0 border border-gray-200">
              <button
                onClick={() => handleSwitchQrTab('url')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  qrModalTab === 'url'
                    ? 'bg-white text-atlas-forest shadow-sm border border-[#C0EAD6]'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>Instant Phone Camera (URL)</span>
              </button>
            </div>

            {/* Content Body */}
            <div className="overflow-y-auto space-y-4 pr-1">
              {(
                <>
                  {/* High-Contrast Phone QR Card */}
                  <div className="flex flex-col items-center justify-center bg-[#FAFCFB] border-2 border-emerald-500/20 rounded-2xl p-6 shadow-sm">
                    {qrModalDataUrl ? (
                      <div className="p-3 bg-white rounded-2xl shadow-md border border-gray-200">
                        <img
                          src={qrModalDataUrl}
                          alt="Mobile Camera QR Code"
                          className="w-64 h-64 sm:w-72 sm:h-72 object-contain rounded-lg"
                        />
                      </div>
                    ) : (
                      <div className="w-64 h-64 sm:w-72 sm:h-72 flex flex-col items-center justify-center text-xs text-atlas-muted">
                        <RefreshCw className="w-8 h-8 animate-spin text-atlas-forest mb-2" />
                        <span>Generating ultra-fast camera QR...</span>
                      </div>
                    )}

                    <div className="mt-4 text-center max-w-sm">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-bold mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Scans in &lt;0.1s on iPhone & Android
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed mt-1">
                        Open your phone's <strong>default camera app</strong> (or Google Lens) and point it at the code above. Tap the link banner to inspect the responsive certificate.
                      </p>
                    </div>
                  </div>

                  {/* Verification URL box */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-atlas-navy flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-emerald-600" />
                        Direct Local Verification URL:
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100/70 font-semibold px-2 py-0.5 rounded">
                        LAN Live Node
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={selectedQrReport.verifyUrl || `http://10.112.136.85:3847/verify?ref=${encodeURIComponent(selectedQrReport.certRef)}`}
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-800 select-all outline-none"
                      />
                      <button
                        onClick={() => {
                          const u = selectedQrReport.verifyUrl || `http://10.112.136.85:3847/verify?ref=${encodeURIComponent(selectedQrReport.certRef)}`
                          navigator.clipboard.writeText(u)
                          setCopiedUrlToast(true)
                          setTimeout(() => setCopiedUrlToast(false), 2000)
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition shrink-0 flex items-center gap-1"
                      >
                        {copiedUrlToast ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedUrlToast ? 'Copied!' : 'Copy Link'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-atlas-border shrink-0">
              <button
                onClick={() => {
                  const contentToCopy = selectedQrReport.verifyUrl || `http://10.112.136.85:3847/verify?ref=${encodeURIComponent(selectedQrReport.certRef)}`
                  navigator.clipboard.writeText(contentToCopy)
                  setCopiedToast(true)
                  setTimeout(() => setCopiedToast(false), 2000)
                }}
                className="px-4 py-2 bg-atlas-forest hover:bg-atlas-forestDark text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                {copiedToast ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedToast ? 'Copied to Clipboard!' : 'Copy URL'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const u = selectedQrReport.verifyUrl || `http://10.112.136.85:3847/verify?ref=${encodeURIComponent(selectedQrReport.certRef)}`
                    window.open(u, '_blank')
                  }}
                  className="px-4 py-2 border border-atlas-border hover:bg-atlas-bg text-atlas-navy text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-atlas-forest" />
                  Open in Web Browser
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
