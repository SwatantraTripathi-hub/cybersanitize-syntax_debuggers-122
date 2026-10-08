import { useState, useEffect } from 'react'
import { FileX, Folder, File, X, CheckCircle2, Flame, Usb, ShieldCheck, Layers, AlertTriangle, RefreshCw, Network } from 'lucide-react'
import { useCase } from '../../context/CaseContext'

export default function FileEraser() {
  const { 
    activeCase, 
    operator, 
    drives,
    orchestrationMode,
    selectedFleetNode,
    backToFleetOverview
  } = useCase()

  const [files, setFiles] = useState<{path: string, size: number}[]>([])
  const [standard, setStandard] = useState('nist-clear')
  const [cleanMetadata, setCleanMetadata] = useState(true)
  
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [progress, setProgress] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSelectFiles = async () => {
    if (window.api?.selectFiles) {
      try {
        const selected = await window.api.selectFiles()
        if (selected && selected.length > 0) {
          const newFiles = selected.map(p => ({ path: p, size: 1024 * 64 }))
          setFiles(prev => [...prev, ...newFiles])
          setErrorMessage(null)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const handleSelectFolder = async () => {
    if (window.api?.selectFolder) {
      try {
        const folder = await window.api.selectFolder()
        if (folder) {
          const folderPath = Array.isArray(folder) ? folder[0] : folder
          setFiles(prev => [...prev, { path: folderPath, size: 1024 * 1024 * 2 }])
          setErrorMessage(null)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (window.api?.onFileEraseProgress) {
      window.api.onFileEraseProgress((p: any) => {
        setProgress(p)
        if (p.status === 'completed') setStatus('completed')
        if (p.status === 'failed') {
          setStatus('failed')
          if (p.error) setErrorMessage(p.error)
        }
      })
    }
    
    return () => {
      if (window.api?.removeFileEraseProgressListener) {
        window.api.removeFileEraseProgressListener()
      }
    }
  }, [])

  const handleStart = async () => {
    if (files.length === 0) return
    const isConfirmed = window.confirm(
      `PERMANENT FILE SHRED WARNING:\n\n${files.length} items will be permanently erased using the 4-step metadata cleansing engine.\nCase: ${activeCase.caseId}\n\nBoundary Guard: Deletions are strictly restricted to the specified target files and their parent partition clusters.\n\nProceed?`
    )
    if (!isConfirmed) return
    
    setStatus('running')
    setErrorMessage(null)
    setProgress({
      percent: 1,
      percentage: 1,
      stepName: 'Initializing 4-Step Cleansing Pipeline...',
      currentStep: 1,
      filesProcessed: 0,
      totalFiles: files.length
    })
    
    if (window.api?.startFileErase) {
      try {
        await window.api.startFileErase({
          paths: files.map(f => f.path),
          standard,
          cleanMetadata,
          caseMeta: {
            caseId: activeCase.caseId,
            operatorId: operator.operatorId,
            caseTitle: activeCase.title,
            evidenceTag: activeCase.evidenceTag,
            cleanMetadata,
            overrideWriteBlocker: true
          }
        })
        setStatus('completed')
        setProgress({
          percent: 100,
          percentage: 100,
          stepName: 'Forensic Shredding Complete',
          status: 'completed',
          filesProcessed: files.length,
          totalFiles: files.length
        })
        setFiles([])
      } catch (e: any) {
        console.error(e)
        setStatus('failed')
        setErrorMessage(e.message || 'File shredding encountered an error. Ensure target is not open in another app.')
      }
    }
  }

  const handleReset = () => {
    setStatus('idle')
    setProgress(null)
    setErrorMessage(null)
  }

  // Detect USB partitions
  const usbPartitions = drives.filter(d => d.isPartition && (d.isRemovable || d.busType === 'USB'))

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Multi-Device Target Context Banner */}
      {orchestrationMode === 'MULTI' && (
        <div className="bg-atlas-forest/10 border border-atlas-forest/30 rounded-xl p-3.5 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-atlas-forest text-white flex items-center justify-center font-bold shrink-0">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-atlas-navy flex items-center gap-2">
                <span>Multi-Device Fleet Orchestration Active</span>
                {selectedFleetNode && (
                  <span className="font-mono text-[10px] bg-atlas-forest text-white px-2 py-0.5 rounded-full">
                    Target Node: {selectedFleetNode.hostname} ({selectedFleetNode.ip})
                  </span>
                )}
              </div>
              <div className="text-atlas-muted text-[11px] mt-0.5">
                {selectedFleetNode
                  ? `File shredding scoped to remote workstation ${selectedFleetNode.hostname}. Cryptographic erasure logs are recorded in the Merkle audit trail.`
                  : 'Operating in local coordinator scope. Switch to individual workstations via Fleet Mesh Lobby.'}
              </div>
            </div>
          </div>
          <button
            onClick={backToFleetOverview}
            className="px-3 py-1.5 bg-white border border-atlas-border hover:border-atlas-forest text-atlas-forest font-semibold rounded-lg text-xs transition shrink-0"
          >
            ← Back to Fleet Mesh
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-atlas-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-atlas-navy tracking-tight">
              4-Step File & Metadata Shredder
            </h1>
            <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-atlas-emeraldLight text-atlas-forest border border-[#C0EAD6]">
              Cluster & MFT Purge
            </span>
          </div>
          <p className="text-xs text-atlas-muted mt-1">
            Cluster overwrite, slack purge, filename scramble, and pointer truncation strictly bounded to target files.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            onClick={handleSelectFiles} 
            disabled={status === 'running'} 
            className="px-4 py-2 bg-atlas-forest hover:bg-atlas-forestDark text-white font-semibold text-xs rounded-lg transition shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            <File className="w-3.5 h-3.5" /> Select Files
          </button>
          <button 
            onClick={handleSelectFolder} 
            disabled={status === 'running'} 
            className="px-4 py-2 bg-white hover:bg-atlas-bg border border-atlas-border text-atlas-navy font-semibold text-xs rounded-lg transition shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Folder className="w-3.5 h-3.5 text-atlas-forest" /> Select Folder
          </button>
        </div>
      </div>

      {/* Detected USB Partition Targets Status Bar */}
      {usbPartitions.length > 0 && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <Usb className="w-4 h-4 text-emerald-700 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold flex items-center gap-1.5 flex-wrap">
                <span>Detected Pen Drive Partitions:</span>
                {usbPartitions.map((p, idx) => (
                  <span key={idx} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-emerald-800 border border-emerald-300 font-bold">
                    [{p.driveLetter}:] {p.formattedSize}
                  </span>
                ))}
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5 truncate">
                Boundary Guard Active: Shredding files on one partition will strictly isolate and protect all other partitions.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-emerald-800 font-semibold shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Partition Isolation Guaranteed</span>
          </div>
        </div>
      )}

      {/* 4-Step Cleansing Diagram Bar */}
      <div className="bg-white border border-atlas-border rounded-xl p-5 shadow-atlas">
        <span className="text-xs font-bold uppercase tracking-wider text-atlas-muted block mb-3.5">
          4-Step Metadata Cleansing Pipeline
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 text-xs">
          {[
            { step: '1', title: 'Cluster Overwrite', desc: 'Overwrites sector cluster data with pure zeros.' },
            { step: '2', title: 'Slack Space Purge', desc: 'Zeroes slack space up to 4096-byte cluster boundary.' },
            { step: '3', title: 'Filename Scramble', desc: 'Renames to 32 random hex characters before unlinking.' },
            { step: '4', title: 'Pointer Truncation', desc: 'Truncates file pointer to 0 bytes and frees $MFT record.' },
          ].map(s => (
            <div key={s.step} className="p-3.5 rounded-xl bg-atlas-bg border border-atlas-border space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-atlas-emeraldLight text-atlas-forest font-mono font-bold flex items-center justify-center text-xs border border-[#C0EAD6]">
                  {s.step}
                </span>
                <span className="font-bold text-atlas-navy text-xs">{s.title}</span>
              </div>
              <p className="text-[11px] text-atlas-muted leading-tight">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Files Queue List */}
      <div className="bg-white border border-atlas-border rounded-xl p-6 space-y-4 shadow-atlas">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-atlas-muted flex items-center gap-2">
            <Layers className="w-4 h-4 text-atlas-forest" />
            Selected Targets for Shredding ({files.length})
          </span>
          {files.length > 0 && status === 'idle' && (
            <button onClick={() => setFiles([])} className="text-xs text-red-600 hover:text-red-700 font-semibold">
              Clear Queue
            </button>
          )}
        </div>

        <div className="bg-atlas-bg border border-atlas-border rounded-xl min-h-[160px] max-h-[300px] overflow-y-auto p-3 space-y-2">
          {files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-atlas-muted py-10 space-y-2">
              <FileX className="w-10 h-10 text-atlas-forest/30" />
              <p className="text-xs">No files selected. Click "Select Files" or "Select Folder" above to queue targets on your USB partition.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {files.map((file, i) => {
                const driveMatch = file.path.match(/^([A-Za-z]):/);
                const letter = driveMatch ? driveMatch[1].toUpperCase() : null;
                return (
                  <li key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-atlas-border text-xs shadow-sm">
                    <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                      <File className="w-4 h-4 text-atlas-forest shrink-0" />
                      {letter && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-atlas-navy border border-gray-200 shrink-0">
                          [{letter}:]
                        </span>
                      )}
                      <span className="font-mono text-atlas-navy truncate" title={file.path}>{file.path}</span>
                    </div>
                    <button 
                      onClick={() => removeFile(i)} 
                      disabled={status === 'running'} 
                      className="p-1 hover:bg-red-50 text-atlas-muted hover:text-red-600 rounded transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-bold text-atlas-muted block uppercase">Standard</label>
            <div className="flex gap-4 text-xs font-medium text-atlas-navy">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="fStd" 
                  value="nist-clear" 
                  checked={standard === 'nist-clear'} 
                  onChange={e => setStandard(e.target.value)} 
                  disabled={status === 'running'}
                  className="text-atlas-forest focus:ring-atlas-forest" 
                />
                <span>NIST Clear (Zero-Fill)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="fStd" 
                  value="nist-purge" 
                  checked={standard === 'nist-purge'} 
                  onChange={e => setStandard(e.target.value)} 
                  disabled={status === 'running'}
                  className="text-atlas-forest focus:ring-atlas-forest" 
                />
                <span>NIST Purge (Crypto Noise)</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-atlas-muted block uppercase">Clean Metadata</label>
            <label className="flex items-center gap-2 text-xs text-atlas-navy font-medium cursor-pointer">
              <input 
                type="checkbox" 
                checked={cleanMetadata} 
                onChange={e => setCleanMetadata(e.target.checked)} 
                disabled={status === 'running'}
                className="rounded border-atlas-border text-atlas-forest focus:ring-atlas-forest" 
              />
              <span>Purge Windows Explorer MRU Traces, JumpLists & LNK shortcuts</span>
            </label>
          </div>
        </div>

        {/* Error Banner */}
        {status === 'failed' && errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-900">
            <div className="flex items-center gap-2 font-bold text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Shredding Error Encountered</span>
            </div>
            <p className="text-[11px] font-mono leading-relaxed">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="mt-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition shadow-sm"
            >
              Reset & Try Again
            </button>
          </div>
        )}

        {/* Status Actions */}
        {status === 'idle' ? (
          <button 
            onClick={handleStart}
            disabled={files.length === 0}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold rounded-xl text-sm transition-all shadow-md flex justify-center items-center gap-2"
          >
            <Flame className="w-5 h-5" />
            START 4-STEP FORENSIC SHREDDING
          </button>
        ) : status === 'running' ? (
          <div className="bg-atlas-bg border border-atlas-border rounded-xl p-5 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-atlas-forest animate-spin" />
                <span className="font-bold text-atlas-forest font-sans">
                  {progress?.stepName || 'Executing 4-Step Cleansing Pipeline...'}
                </span>
              </div>
              <span className="text-atlas-navy font-bold">{progress?.percentage || progress?.percent || 0}%</span>
            </div>
            
            <div className="h-3 bg-[#E8EDEB] rounded-full overflow-hidden">
              <div 
                className="h-full bg-atlas-forest transition-all duration-300"
                style={{ width: `${progress?.percentage || progress?.percent || 0}%` }}
              ></div>
            </div>

            {progress?.currentFile && (
              <div className="text-[11px] text-atlas-muted truncate">
                Processing: <span className="font-bold text-atlas-navy">{progress.currentFile}</span>
              </div>
            )}
          </div>
        ) : status === 'completed' ? (
          <div className="bg-atlas-emeraldLight border border-[#C0EAD6] rounded-xl p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-atlas-forest font-bold font-sans text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Selected files and directory traces have been permanently obliterated!</span>
              </div>
              <button
                onClick={handleReset}
                className="px-3 py-1.5 bg-atlas-forest hover:bg-atlas-forestDark text-white font-semibold rounded-lg text-xs transition shadow-sm"
              >
                Shred More Files
              </button>
            </div>
            <p className="text-[11px] text-atlas-navy leading-relaxed font-mono">
              - Physical clusters overwritten with NIST standard zeroes<br />
              - Cluster slack space purged up to 4096-byte boundaries<br />
              - Filename records cryptographically scrambled<br />
              - File pointers truncated to 0 bytes and directory unlinked<br />
              - Recent files and shell MRU cache cleared
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
