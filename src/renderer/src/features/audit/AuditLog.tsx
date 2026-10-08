import React, { useState, useEffect, useRef } from 'react'
import {
  Download, ChevronDown, ChevronUp, Search, ShieldCheck, Cpu,
  Link, AlertTriangle, CheckCircle2, Package, RefreshCw, Eye, HardDrive, FileX, XCircle, Link2, Server
} from 'lucide-react'
import { useCase } from '../../context/CaseContext'
import ChainVisualizer from './components/ChainVisualizer'

export default function AuditLog() {
  const { activeCase, operator, caseList, importCase, orchestrationMode, connectedNodes } = useCase()

  const [logs, setLogs] = useState<any[]>([])
  const [expandedRow, setExpandedRow] = useState<any>(null)
  const [caseFilter, setCaseFilter] = useState<string>(activeCase.caseId)
  const [systemFilter, setSystemFilter] = useState<string>('ALL')
  const [filterOp, setFilterOp] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [chainStatus, setChainStatus] = useState<{ intact: boolean; checkedBlocks: number; reason?: string; brokenAtId?: number } | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isExportingBundle, setIsExportingBundle] = useState(false)
  const [bundleResult, setBundleResult] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [showVisualizer, setShowVisualizer] = useState(true)

  useEffect(() => {
    setCaseFilter(activeCase.caseId)
  }, [activeCase.caseId])

  const fetchLogs = async () => {
    if (window.api?.getAuditLogs) {
      try {
        const data = await window.api.getAuditLogs({
          limit: 100,
          caseId: caseFilter !== 'ALL' ? caseFilter : undefined
        })
        setLogs(data || [])
      } catch (e) {
        console.error(e)
      }
    }
  }

  useEffect(() => { fetchLogs() }, [caseFilter])

  useEffect(() => {
    if (window.api?.getAuditPublicKey) {
      window.api.getAuditPublicKey().then((pk: string) => setPublicKey(pk || '')).catch(() => {})
    }
  }, [])

  const handleExport = async () => {
    if (window.api?.exportAuditCSV) {
      try {
        const res = await window.api.exportAuditCSV(caseFilter !== 'ALL' ? caseFilter : undefined)
        if (res.success) alert(`Cryptographic Audit Trail exported to:\n${res.filePath}`)
      } catch (e) { console.error(e) }
    }
  }

  const handleExportChain = async () => {
    if (!window.api?.exportAuditChain) return
    const res = await window.api.exportAuditChain(caseFilter !== 'ALL' ? caseFilter : undefined)
    if (res.success) alert(`Signed audit chain exported to:\n${res.filePath}`)
  }

  const handleVerifyChainFile = async () => {
    if (!window.api?.verifyAuditChainFile) return
    const result = await window.api.verifyAuditChainFile()
    setChainStatus({ intact: result.isValid, checkedBlocks: result.count, reason: result.errors?.join(' ') })
  }

  const handleVerifyChain = async () => {
    if (!window.api?.verifyAuditChain) return
    setIsVerifying(true)
    setChainStatus(null)
    try {
      const result = await window.api.verifyAuditChain()
      setChainStatus(result)
    } catch (e) { console.error(e) }
    setIsVerifying(false)
  }

  const handleExportBundle = async () => {
    if (!window.api?.exportForensicBundle) return
    setIsExportingBundle(true)
    setBundleResult(null)
    try {
      const res = await window.api.exportForensicBundle(caseFilter !== 'ALL' ? caseFilter : undefined)
      setBundleResult(res)
    } catch (e: any) { setBundleResult({ success: false, message: e.message }) }
    setIsExportingBundle(false)
  }

  const handleImportVerify = async () => {
    if (!window.api?.importVerifyBundle) return
    setIsImporting(true)
    setImportResult(null)
    try {
      const res = await window.api.importVerifyBundle()
      setImportResult(res)
      if (res && res.success && res.isValid && res.caseRecord) {
        importCase(res.caseRecord)
        if (res.caseId && res.caseId !== 'ALL') {
          setCaseFilter(res.caseId)
        }
        if (window.api?.getAuditLogs) {
          const updated = await window.api.getAuditLogs({
            limit: 100,
            caseId: res.caseId && res.caseId !== 'ALL' ? res.caseId : undefined
          })
          setLogs(updated || [])
        }
      }
    } catch (e: any) { setImportResult({ success: false, isValid: false, errors: [e.message] }) }
    setIsImporting(false)
  }

  const filteredLogs = logs.filter(log => {
    if (caseFilter !== 'ALL') {
      const details = typeof log.details === 'object' ? log.details : {}
      if (details.caseId !== caseFilter && log.case_id !== caseFilter) return false
    }
    if (filterOp !== 'ALL' && log.operation !== filterOp) return false
    if (filterStatus !== 'ALL' && log.status !== filterStatus) return false
    if (systemFilter === 'LOCAL' && (log.details?.fleetCluster || log.target?.includes('Fleet Node'))) return false
    if (systemFilter !== 'ALL' && systemFilter !== 'LOCAL') {
      const matchNode = log.details?.nodeId === systemFilter || log.details?.systemHost === systemFilter || log.target?.includes(systemFilter)
      if (!matchNode) return false
    }
    if (search && !JSON.stringify(log).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'COMPLETED': 'bg-atlas-emeraldLight text-atlas-forest border border-[#C0EAD6]',
      'VERIFIED': 'bg-atlas-emeraldLight text-atlas-forest border border-[#C0EAD6]',
      'IN_PROGRESS': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
      'FAILED': 'bg-red-50 text-red-700 border border-red-200'
    }
    const cls = colors[status] || 'bg-atlas-bg text-atlas-muted border-atlas-border'
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${cls}`}>{status}</span>
  }

  const getOpIcon = (op: string) => {
    switch (op) {
      case 'DRIVE_WIPE': return <HardDrive className="w-3.5 h-3.5 text-atlas-forest shrink-0" />
      case 'FILE_ERASE': return <FileX className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      case 'FILE_RECOVERY': return <Search className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      case 'WRITE_BLOCKER_VERIFIED': return <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      case 'EVIDENCE_IMPORT': return <Package className="w-3.5 h-3.5 text-purple-600 shrink-0" />
      case 'FLEET_ATTESTATION': return <Server className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
      default: return <Cpu className="w-3.5 h-3.5 text-gray-500 shrink-0" />
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 shrink-0 pb-3 border-b border-atlas-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-atlas-navy tracking-tight">Tamper-Evident Chained Audit Ledger</h1>
            <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-atlas-emeraldLight text-atlas-forest border border-[#C0EAD6]">
              SHA-256 Merkle Chained
            </span>
          </div>
          <p className="text-xs text-atlas-muted mt-1">
            Forward-integrity cryptographic chaining — every block signed with Sovereign Ed25519 Enclave seal.
          </p>
          {publicKey && (
            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-atlas-muted">
              <Cpu className="w-3 h-3 text-atlas-forest shrink-0" />
              <span className="truncate max-w-sm" title={publicKey}>Public Ledger Key: {publicKey.slice(0, 40)}...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Link className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            {isVerifying ? 'Verifying...' : 'Verify Chain Integrity'}
          </button>
          <button
            onClick={() => setShowVisualizer(!showVisualizer)}
            className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-lg font-semibold text-xs transition shadow-sm ${
              showVisualizer
                ? 'bg-atlas-emeraldLight text-atlas-forest border-[#C0EAD6]'
                : 'bg-white text-atlas-muted border-atlas-border hover:border-atlas-forest'
            }`}
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-600" />
            {showVisualizer ? 'Hide Visualizer' : 'Chain Visualizer'}
          </button>
          <button
            onClick={handleExportBundle}
            disabled={isExportingBundle}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Package className={`w-3.5 h-3.5 ${isExportingBundle ? 'animate-pulse' : ''}`} />
            {isExportingBundle ? 'Packaging...' : 'Export .forensic Bundle'}
          </button>
          <button
            onClick={handleImportVerify}
            disabled={isImporting}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Eye className={`w-3.5 h-3.5 ${isImporting ? 'animate-pulse' : ''}`} />
            {isImporting ? 'Verifying...' : 'Import & Verify Bundle'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-atlas-forest hover:bg-atlas-forestDark text-white font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={handleExportChain}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Chain
          </button>
          <button
            onClick={handleVerifyChainFile}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold text-xs rounded-lg transition shadow-sm"
          >
            <Eye className="w-3.5 h-3.5" /> Verify Chain File
          </button>
        </div>
      </div>

      {/* Chain Integrity Banner */}
      {chainStatus && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs font-sans shadow-sm shrink-0 ${
          chainStatus.intact
            ? 'bg-atlas-emeraldLight border-[#C0EAD6] text-atlas-forest'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {chainStatus.intact
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          }
          <div className="min-w-0 flex-1">
            <div className="font-bold">
              {chainStatus.intact
                ? `LEDGER INTEGRITY VERIFIED — All ${chainStatus.checkedBlocks} blocks form an unbroken cryptographic chain.`
                : chainStatus.brokenAtId
                  ? `TAMPERING DETECTED — Hash chain broken at Block #${chainStatus.brokenAtId}!`
                  : 'TAMPERING DETECTED — The exported chain could not be authenticated.'
              }
            </div>
            {chainStatus.reason && <div className="mt-0.5 font-mono text-[10px] opacity-80">{chainStatus.reason}</div>}
            {!chainStatus.intact && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (window.api?.repairAuditChain) {
                      setIsVerifying(true)
                      await window.api.repairAuditChain()
                      const res = await window.api.verifyAuditChain()
                      setChainStatus(res)
                      const logsData = await window.api.getAuditLogs({ limit: 100, caseId: caseFilter !== 'ALL' ? caseFilter : undefined })
                      setLogs(logsData || [])
                      setIsVerifying(false)
                    }
                  }}
                  className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-md text-[11px] font-bold shadow-sm transition"
                >
                  Re-seal & Repair Hash Chain
                </button>
                <span className="text-[10px] text-red-600">Re-links legacy unchained blocks into a verified Merkle chain</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bundle Export/Import Result */}
      {(bundleResult || importResult) && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs font-sans shadow-sm shrink-0 ${
          (bundleResult?.success && !importResult) || importResult?.isValid
            ? 'bg-atlas-emeraldLight border-[#C0EAD6] text-atlas-forest'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <Package className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            {bundleResult && !importResult && (
              bundleResult.success
                ? <><div className="font-bold">Sealed Forensic Bundle exported successfully!</div><div className="font-mono text-[10px] break-all">{bundleResult.filePath}</div><div className="text-[10px]">Manifest SHA-256: {bundleResult.manifestHash?.slice(0, 32)}...</div></>
                : <div className="font-bold">Export failed: {bundleResult.message}</div>
            )}
            {importResult && (
              importResult.isValid
                ? <><div className="font-bold text-atlas-forest">EVIDENCE BUNDLE VERIFIED & IMPORTED — {importResult.blockCount} blocks, Chain Intact, Signature Valid</div><div className="text-[10px]">Case: <span className="font-bold font-mono">{importResult.caseId}</span> | Ingested: {importResult.importedBlocksCount || 0} blocks, {importResult.extractedCertificatesCount || 0} certificates extracted | Key: {importResult.publicKey?.slice(0, 32)}...</div></>
                : <><div className="font-bold text-red-700">VERIFICATION FAILED</div>{(importResult.errors || []).map((e: string, i: number) => <div key={i} className="font-mono text-[10px]">{e}</div>)}</>
            )}
          </div>
          <button onClick={() => { setBundleResult(null); setImportResult(null) }} className="ml-auto shrink-0 text-[10px] underline">Dismiss</button>
        </div>
      )}

      {/* Blockchain Hash Chain Visualizer */}
      {showVisualizer && logs.length > 0 && (
        <div className="shrink-0 animate-in fade-in duration-200">
          <ChainVisualizer
            blocks={logs.slice(0, 20).reverse().map(l => ({
              id: l.id || 0,
              operation: l.operation,
              timestamp: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              prevHash: l.prev_hash ? l.prev_hash.slice(0, 10) + '...' : 'GENESIS',
              hash: l.entry_hash ? l.entry_hash.slice(0, 10) + '...' : 'SEALED',
              isValid: chainStatus?.brokenAtId ? l.id !== chainStatus.brokenAtId : true
            }))}
            isChainValid={chainStatus?.intact ?? true}
          />
        </div>
      )}

      {/* Filter Controls Bar */}
      <div className="bg-white border border-atlas-border rounded-xl p-3.5 flex flex-wrap gap-3 shrink-0 items-center shadow-atlas">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-atlas-muted" />
          <input
            type="text"
            placeholder="Search by Case ID, Operator, target, hash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-atlas-bg border border-atlas-border rounded-lg pl-9 pr-3 py-2 text-xs text-atlas-navy placeholder-atlas-muted focus:border-atlas-forest focus:ring-1 focus:ring-atlas-forest outline-none transition"
          />
        </div>
        <select value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} className="bg-white border border-atlas-border rounded-lg px-3 py-2 text-xs text-atlas-forest font-bold outline-none focus:border-atlas-forest">
          <option value={activeCase.caseId}>Case: {activeCase.caseId} (Active)</option>
          {caseList.filter(c => c.caseId !== activeCase.caseId).map(c => (
            <option key={c.caseId} value={c.caseId}>Case: {c.caseId}</option>
          ))}
          <option value="ALL">All Cases (Global Database)</option>
        </select>
        <select value={filterOp} onChange={(e) => setFilterOp(e.target.value)} className="bg-white border border-atlas-border rounded-lg px-3 py-2 text-xs text-atlas-navy font-medium outline-none focus:border-atlas-forest">
          <option value="ALL">All Operations</option>
          <option value="DRIVE_WIPE">DRIVE_WIPE (Sanitize)</option>
          <option value="FILE_RECOVERY">FILE_RECOVERY (Carve)</option>
          <option value="FILE_ERASE">FILE_ERASE (Shred)</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-white border border-atlas-border rounded-lg px-3 py-2 text-xs text-atlas-navy font-medium outline-none focus:border-atlas-forest">
          <option value="ALL">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="VERIFIED">Verified (Adaptive H(X))</option>
          <option value="FAILED">Failed</option>
        </select>
        {(orchestrationMode === 'MULTI' || connectedNodes.length > 0) && (
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            className="bg-white border border-atlas-border rounded-lg px-3 py-2 text-xs text-atlas-navy font-semibold outline-none focus:border-atlas-forest"
          >
            <option value="ALL">All Systems (Cluster & Local)</option>
            <option value="LOCAL">Local Workstation Only</option>
            {connectedNodes.map((n) => (
              <option key={n.id} value={n.id}>
                Node: {n.hostname} ({n.ip})
              </option>
            ))}
          </select>
        )}
        <button onClick={fetchLogs} className="p-2 text-atlas-forest hover:text-atlas-forestDark border border-atlas-border rounded-lg bg-white" title="Refresh logs">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Multi-Device Cluster Banner */}
      {orchestrationMode === 'MULTI' && (
        <div className="bg-gradient-to-r from-atlas-navy to-atlas-forest text-white px-4 py-2.5 rounded-xl flex items-center justify-between text-xs shadow-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-atlas-green animate-pulse" />
            <span className="font-bold">MULTI-DEVICE FLEET AUDIT TRAIL</span>
            <span className="text-gray-300">| {connectedNodes.length} Cluster Node(s) Connected</span>
          </div>
          <div className="text-[11px] font-mono text-gray-200">
            Immutable Merkle audit ledger across all distributed nodes
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="flex-1 bg-white border border-atlas-border rounded-xl overflow-hidden flex flex-col min-h-0 shadow-atlas">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAFCFB] text-atlas-muted sticky top-0 border-b border-atlas-border">
              <tr>
                <th className="px-4 py-3 font-semibold w-8"></th>
                <th className="px-4 py-3 font-semibold">Block #</th>
                <th className="px-4 py-3 font-semibold">Origin</th>
                <th className="px-4 py-3 font-semibold">Operation</th>
                <th className="px-4 py-3 font-semibold">Target / Device</th>
                <th className="px-4 py-3 font-semibold">Examiner</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Chain Seal</th>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-atlas-muted font-sans text-xs">
                    No matching audit records found in the cryptographic ledger.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedRow === log.id
                  const details = typeof log.details === 'object' ? log.details : {}
                  const hasChain = !!(log.entry_hash || log.prev_hash)
                  const isFleet = details.fleetCluster || (log.target && log.target.includes('Fleet Node'))
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        className={`hover:bg-atlas-bg cursor-pointer transition-colors ${isExpanded ? 'bg-[#F4F9F6]' : ''}`}
                      >
                        <td className="px-4 py-3 text-atlas-muted">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 font-bold text-atlas-forest">#BLOCK-{log.id}</td>
                        <td className="px-4 py-3 font-sans">
                          {isFleet ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Server className="w-2.5 h-2.5" />
                              {details.systemHost || details.nodeId || 'Fleet Node'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-50 text-gray-700 border border-gray-200">
                              Local Host
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-atlas-navy font-sans">
                          <div className="flex items-center gap-1.5">{getOpIcon(log.operation)}<span>{log.operation}</span></div>
                        </td>
                        <td className="px-4 py-3 text-atlas-navy truncate max-w-[180px] font-sans" title={log.target}>{log.target}</td>
                        <td className="px-4 py-3 text-atlas-muted">{log.operator || operator.operatorId}</td>
                        <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
                        <td className="px-4 py-3">
                          {hasChain
                            ? <span className="inline-flex items-center gap-1 text-atlas-forest text-[10px] font-sans font-semibold"><Link className="w-3 h-3" /> Sealed</span>
                            : <span className="text-amber-600 text-[10px] font-sans">Legacy</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-atlas-muted whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#FAFCFB]">
                          <td colSpan={8} className="p-4">
                            <div className="bg-white p-4 rounded-xl border border-atlas-border space-y-3 shadow-sm">
                              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-atlas-forest font-sans">
                                <ShieldCheck className="w-4 h-4 text-atlas-forest" />
                                Cryptographic Block Detail — Forward Chain Verification
                              </div>

                              {/* Hash chain visualization */}
                              <div className="flex items-center gap-2 text-[10px] font-mono overflow-x-auto pb-1">
                                <div className="shrink-0 bg-gray-100 rounded px-2 py-1 border border-gray-200 text-gray-600">
                                  {log.id === 1 ? 'GENESIS' : `#BLOCK-${log.id - 1}`}
                                </div>
                                <div className="text-atlas-forest">→</div>
                                <div className="shrink-0 bg-atlas-emeraldLight rounded px-2 py-1 border border-[#C0EAD6] text-atlas-forest font-bold">
                                  prev_hash: {(log.prev_hash || '0000...0000').slice(0, 12)}...
                                </div>
                                <div className="text-atlas-forest">→</div>
                                <div className="shrink-0 bg-atlas-forest rounded px-2 py-1 text-white font-bold">
                                  #BLOCK-{log.id}
                                </div>
                                <div className="text-atlas-forest">→</div>
                                <div className="shrink-0 bg-atlas-emeraldLight rounded px-2 py-1 border border-[#C0EAD6] text-atlas-forest">
                                  entry_hash: {(log.entry_hash || '').slice(0, 12)}...
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                                <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border">
                                  <span className="text-atlas-muted block mb-1 font-sans">Pre-Operation SHA-256:</span>
                                  <span className="text-atlas-navy break-all">{log.hash_before || details.preHash || '—'}</span>
                                </div>
                                <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border">
                                  <span className="text-atlas-muted block mb-1 font-sans">Post-Operation SHA-256:</span>
                                  <span className="text-atlas-forest font-bold break-all">{log.hash_after || details.postHash || details.acquisitionHashSha256 || '—'}</span>
                                </div>
                                <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border">
                                  <span className="text-atlas-muted block mb-1 font-sans">Prev Block Hash (Chain Link):</span>
                                  <span className="text-atlas-navy break-all">{log.prev_hash || 'Genesis Block'}</span>
                                </div>
                                <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border">
                                  <span className="text-atlas-muted block mb-1 font-sans">This Block Entry Hash:</span>
                                  <span className="text-atlas-forest break-all">{log.entry_hash || '—'}</span>
                                </div>
                              </div>

                              {log.signature && (
                                <div className="p-3 rounded-lg bg-atlas-bg border border-atlas-border text-[11px] font-mono">
                                  <span className="text-atlas-muted block mb-1 font-sans">Ed25519 Enclave Digital Signature:</span>
                                  <span className="text-atlas-navy break-all">{log.signature}</span>
                                </div>
                              )}

                              <div className="p-3 bg-atlas-bg rounded-lg border border-atlas-border font-mono text-[11px] text-atlas-navy overflow-x-auto">
                                <pre>{JSON.stringify(log.details || log, null, 2)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3.5 border-t border-atlas-border bg-[#FAFCFB] flex justify-between items-center text-xs text-atlas-muted font-mono">
          <span>{filteredLogs.length} cryptographic blocks in ledger</span>
          <span className="text-atlas-forest font-semibold flex items-center gap-1.5 font-sans">
            <Cpu className="w-3.5 h-3.5" />
            Sovereign Ed25519 Enclave Active — Tamper-Evident Forward Integrity Chain
          </span>
        </div>
      </div>
    </div>
  )
}
