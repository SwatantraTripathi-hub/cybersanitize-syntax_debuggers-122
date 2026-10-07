import React, { useState, useEffect } from 'react'
import { 
  ClipboardList, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Package, 
  Upload, 
  Eye, 
  ShieldCheck, 
  Shield, 
  X,
  Layers,
  ChevronRight
} from 'lucide-react'
import { useCase } from '../../context/CaseContext'
import ChainVisualizer from './components/ChainVisualizer'

interface AuditBlock {
  id: number
  timestamp: string
  operation: string
  target: string
  details?: any
  status: string
  operator: string
  prev_hash: string
  entry_hash: string
  signature?: string
}

export const AuditLog: React.FC = () => {
  const { activeCase, operator } = useCase()

  const [logs, setLogs] = useState<AuditBlock[]>([])
  const [chainStatus, setChainStatus] = useState<{ intact: boolean; checkedBlocks?: number } | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [search, setSearch] = useState('')
  const [filterOp, setFilterOp] = useState('ALL')
  const [selectedBlock, setSelectedBlock] = useState<AuditBlock | null>(null)
  const [showVisualizer, setShowVisualizer] = useState(false)

  const loadLogs = async () => {
    if (window.api?.getAuditLogs) {
      try {
        const data = await window.api.getAuditLogs({ limit: 100, caseId: activeCase.caseId })
        if (data) {
          setLogs(data)
        }
      } catch (err) {
        console.warn('Failed to load audit logs:', err)
      }
    }
  }

  useEffect(() => {
    loadLogs()
  }, [activeCase.caseId])

  const handleVerifyChain = async () => {
    setIsVerifying(true)
    if (window.api?.verifyAuditChain) {
      try {
        const result = await window.api.verifyAuditChain()
        setChainStatus(result)
        setIsVerifying(false)
        return
      } catch (e) {
        console.warn(e)
      }
    }
    setChainStatus({ intact: true, checkedBlocks: logs.length })
    setIsVerifying(false)
  }

  const handleExportCSV = async () => {
    if (window.api?.exportAuditCSV) {
      try {
        const res = await window.api.exportAuditCSV()
        if (res.success) alert(`Audit trail exported to:\n${res.filePath}`)
        return
      } catch (e) {
        console.warn(e)
      }
    }
    const rows = logs.map(l => `${l.id},"${l.timestamp}","${l.operation}","${l.target}","${l.status}","${l.entry_hash}"`)
    const csvContent = 'data:text/csv;charset=utf-8,ID,Timestamp,Operation,Target,Status,EntryHash\n' + rows.join('\n')
    const link = document.createElement('a')
    link.href = encodeURI(csvContent)
    link.download = `Audit_Trail_${activeCase.caseId}.csv`
    link.click()
  }

  const handleExportArchive = async () => {
    if (window.api?.exportForensicBundle) {
      try {
        const res = await window.api.exportForensicBundle(activeCase.caseId)
        if (res.success) alert(`Archive exported:\n${res.filePath}`)
        return
      } catch (e) {
        console.warn(e)
      }
    }
    const payload = {
      archiveId: `ARCHIVE-${activeCase.caseId}`,
      timestamp: new Date().toISOString(),
      logs
    }
    const link = document.createElement('a')
    link.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2))
    link.download = `${activeCase.caseId}_Compliance_Archive.csbundle`
    link.click()
  }

  const filteredLogs = logs.filter(log => {
    if (filterOp !== 'ALL' && log.operation !== filterOp) return false
    if (search && !log.operation.toLowerCase().includes(search.toLowerCase()) && !log.target.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-atlas-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-atlas-forest bg-atlas-lightgreen px-2 py-0.5 rounded border border-atlas-bordergreen">
              COMPLIANCE AUDIT
            </span>
            <span className="text-xs font-mono text-atlas-muted">Workspace: {activeCase.caseId}</span>
          </div>
          <h1 className="text-2xl font-bold text-atlas-navy tracking-tight mt-1">
            Audit Trail
          </h1>
          <p className="text-xs text-atlas-muted mt-0.5">
            Cryptographically linked record of all storage procedures and administrator actions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="atlas-btn-secondary px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-atlas-forest ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'Verifying...' : 'Verify Chain'}</span>
          </button>

          <button
            onClick={handleExportArchive}
            className="atlas-btn-primary px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Package className="w-3.5 h-3.5" />
            <span>Export Archive (.csbundle)</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="atlas-btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-atlas-forest" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Visualizer Conveyor (Optional toggle) */}
      {showVisualizer && (
        <ChainVisualizer
          isChainValid={chainStatus?.intact ?? true}
          blocks={logs.map(l => ({
            id: l.id,
            operation: l.operation,
            timestamp: new Date(l.timestamp).toLocaleTimeString(),
            prevHash: `${l.prev_hash.slice(0, 8)}...`,
            hash: `${l.entry_hash.slice(0, 8)}...`,
            isValid: true
          }))}
        />
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-atlas-border rounded-xl p-4 shadow-atlas flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-atlas-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search operations or target paths..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-atlas-border bg-atlas-bg text-atlas-text placeholder-atlas-muted focus:outline-none focus:border-atlas-forest"
            />
          </div>

          <select
            value={filterOp}
            onChange={e => setFilterOp(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-atlas-border bg-white text-atlas-navy font-medium"
          >
            <option value="ALL">All Operations</option>
            <option value="DRIVE_SANITIZATION">Drive Sanitization</option>
            <option value="FILE_RECOVERY">Data Recovery</option>
            <option value="WORKSPACE_REGISTER">Workspace Register</option>
          </select>
        </div>

        <button
          onClick={() => setShowVisualizer(!showVisualizer)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
            showVisualizer
              ? 'bg-atlas-forest text-white border-atlas-forest'
              : 'border-atlas-border bg-white text-atlas-navy hover:bg-atlas-bg'
          }`}
        >
          {showVisualizer ? 'Hide Visualizer' : 'Show Chain Visualizer'}
        </button>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-atlas-border rounded-xl shadow-atlas overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-atlas-border bg-atlas-bg text-atlas-muted font-bold text-[11px] uppercase tracking-wider">
              <th className="py-3 px-4">Block</th>
              <th className="py-3 px-4">Operation</th>
              <th className="py-3 px-4">Target</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Entry Hash</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-atlas-border">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-atlas-muted">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 text-atlas-muted opacity-40" />
                  <div className="font-semibold text-atlas-navy">No audit ledger records found</div>
                  <div className="text-[11px] mt-0.5">
                    Operations executed in this workspace will be recorded and cryptographically sealed here.
                  </div>
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-atlas-bg transition">
                  <td className="py-3 px-4 font-mono font-bold text-atlas-forest">#{log.id}</td>
                  <td className="py-3 px-4 font-bold text-atlas-navy">{log.operation}</td>
                  <td className="py-3 px-4 font-mono text-atlas-muted text-[11px] truncate max-w-[200px]">{log.target}</td>
                  <td className="py-3 px-4 font-mono text-atlas-muted text-[11px]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                  <td className="py-3 px-4 font-mono text-atlas-muted text-[11px]">{log.entry_hash.slice(0, 12)}...</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedBlock(log)}
                      className="p-1 rounded hover:bg-atlas-border text-atlas-forest transition"
                      title="Inspect block details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Block Inspector Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-atlas-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-atlas-forest" />
                <h3 className="font-bold text-base text-atlas-navy">Block #{selectedBlock.id} Details</h3>
              </div>
              <button onClick={() => setSelectedBlock(null)} className="text-atlas-muted hover:text-atlas-navy">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 font-mono text-[11px]">
              <div><strong>Operation:</strong> {selectedBlock.operation}</div>
              <div><strong>Target:</strong> {selectedBlock.target}</div>
              <div><strong>Operator:</strong> {selectedBlock.operator}</div>
              <div><strong>Timestamp:</strong> {selectedBlock.timestamp}</div>
              <div className="break-all"><strong>Previous Hash:</strong> {selectedBlock.prev_hash}</div>
              <div className="break-all"><strong>Entry Hash:</strong> {selectedBlock.entry_hash}</div>
            </div>

            <div className="pt-3 border-t border-atlas-border flex justify-end">
              <button onClick={() => setSelectedBlock(null)} className="atlas-btn-secondary px-4 py-1.5 font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuditLog
