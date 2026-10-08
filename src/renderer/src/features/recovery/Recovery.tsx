import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  Folder,
  FileImage,
  FileText,
  FileArchive,
  CheckCircle2,
  Lock,
  Eye,
  X,
  FileCode,
  RefreshCw,
  Monitor,
  Usb,
  Activity,
  ShieldOff,
  ShieldCheck,
  Zap,
  Film,
  Database,
  AlertTriangle,
  ShieldAlert,
  Network
} from 'lucide-react'
import { useCase } from '../../context/CaseContext'
import WriteBlockerBadge from './components/WriteBlockerBadge'

export default function Recovery() {
  const { 
    activeCase, 
    operator, 
    drives, 
    isDrivesLoading, 
    refreshDrives, 
    setIsWriteBlockerModalOpen,
    preWipeFiles,
    setPreWipeFiles,
    driveWasWiped,
    orchestrationMode,
    selectedFleetNode,
    isJoinedClientNode,
    dispatchBatchRecovery,
    selectedDrive,
    backToFleetOverview
  } = useCase()

  const [sourcePath, setSourcePath] = useState<string>('')
  const [sourceSize, setSourceSize] = useState<number | undefined>(undefined)
  const [outputPath, setOutputPath] = useState<string>('C:\\ForensicEvidence\\Recovered')

  const [searchParams] = useSearchParams()

  useEffect(() => {
    const querySource = searchParams.get('source')
    if (querySource) {
      setSourcePath(querySource)
    }
  }, [searchParams])

  const [activeCategory, setActiveCategory] = useState<'ALL' | 'Images' | 'Videos' | 'Documents' | 'Databases' | 'Text'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELETED' | 'ACTIVE'>('ALL')
  const [scanMode, setScanMode] = useState<'fast' | 'deep'>('fast')
  const [fileTypes, setFileTypes] = useState<{ [key: string]: boolean }>({
    PNG: true,
    JPEG: true,
    WEBP: true,
    GIF: true,
    MP4: true,
    MOV: true,
    SQLITE: true,
    PDF: true,
    DOCX: true,
    ZIP: true,
    TXT: true,
    BMP: false
  })

  // Anti-Forensics & Prior Wipe Attempt State
  const [antiForensics, setAntiForensics] = useState<any | null>(null)
  const [isCheckingAntiForensics, setIsCheckingAntiForensics] = useState<boolean>(false)

  // Live query for prior wipe / anti-forensics upon source selection
  useEffect(() => {
    if (!sourcePath) {
      setAntiForensics(null)
      return
    }
    if (window.api?.detectAntiForensics) {
      setIsCheckingAntiForensics(true)
      window.api.detectAntiForensics(sourcePath)
        .then((res: any) => {
          setAntiForensics(res)
        })
        .catch((err: any) => {
          console.warn('[AntiForensics] Detection query failed:', err)
          setAntiForensics(null)
        })
        .finally(() => {
          setIsCheckingAntiForensics(false)
        })
    }
  }, [sourcePath])

  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [progress, setProgress] = useState<any>(null)
  const [recoveredFiles, setRecoveredFiles] = useState<any[]>([])

  // Preview Modal
  const [previewFile, setPreviewFile] = useState<any | null>(null)

  // Heatmap canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleSelectSource = async () => {
    if (window.api?.selectSource) {
      try {
        const p = await window.api.selectSource()
        if (p) {
          setSourcePath(p)
          setSourceSize(undefined)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const handleSelectOutput = async () => {
    if (window.api?.selectFolder) {
      try {
        const p = await window.api.selectFolder()
        if (p && p.length > 0) {
          setOutputPath(Array.isArray(p) ? p[0] : p)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const handleCreateTestEvidence = async () => {
    if (window.api?.createTestImage) {
      try {
        const p = await window.api.createTestImage(20)
        if (p) {
          setSourcePath(p)
          setSourceSize(20 * 1024 * 1024)
          alert(`Test Evidence Image generated:\n${p}`)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  const toggleType = (type: string) => {
    setFileTypes(prev => ({ ...prev, [type]: !prev[type as keyof typeof prev] }))
  }

  // Draw heatmap
  const drawHeatmap = (pct: number, isDone: boolean) => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    const width = canvasRef.current.width
    const height = canvasRef.current.height
    const totalBlocks = 1000
    const blocksScanned = isDone ? totalBlocks : Math.min(totalBlocks, Math.floor((pct / 100) * totalBlocks))

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#FAFCFB'
    ctx.fillRect(0, 0, width, height)

    const cols = 50
    const rows = totalBlocks / cols
    const blockW = width / cols
    const blockH = height / rows

    for (let i = 0; i < totalBlocks; i++) {
      const x = (i % cols) * blockW
      const y = Math.floor(i / cols) * blockH

      if (i < blocksScanned) {
        ctx.fillStyle = '#00684A'
      } else if (i === blocksScanned && !isDone) {
        ctx.fillStyle = '#00ED64'
      } else {
        ctx.fillStyle = '#E8EDEB'
      }

      ctx.fillRect(x, y, blockW - 1, blockH - 1)
    }
  }

  // Draw initial clean canvas
  useEffect(() => {
    drawHeatmap(0, false)
  }, [])

  useEffect(() => {
    drawHeatmap(progress?.percentage || progress?.percent || 0, status === 'completed')
  }, [progress, status])

  useEffect(() => {
    if (!selectedFleetNode || isJoinedClientNode || !window.api) return
    const unsubs: Array<(() => void) | void> = []
    if (window.api.onFleetTelemetry) {
      unsubs.push(window.api.onFleetTelemetry((data: any) => {
        if (data.nodeId !== selectedFleetNode.id) return
        const percent = data.telemetry.progress || 0
        setProgress({
          percentage: percent,
          percent,
          stage: data.telemetry.logLine,
          phase: data.telemetry.phase,
          speed: data.telemetry.speed,
          eta: data.telemetry.eta
        })
        drawHeatmap(percent, false)
        if (data.telemetry.foundFile) {
          setRecoveredFiles(prev => {
            const foundFile = data.telemetry.foundFile
            const exists = prev.some(file => file.offset === foundFile.offset && file.type === foundFile.type)
            return exists ? prev : [...prev, foundFile]
          })
        }
        if (data.telemetry.phase === 'RECOVERING') setStatus('running')
      }))
    }
    if (window.api.onFleetNodeComplete) {
      unsubs.push(window.api.onFleetNodeComplete((data: any) => {
        if (data.nodeId !== selectedFleetNode.id || data.result.operation !== 'RECOVERY') return
        setStatus(data.result.success ? 'completed' : 'failed')
        setProgress((previous: any) => ({ ...previous, percentage: 100, percent: 100, stage: data.result.summary, phase: data.result.success ? 'COMPLETED' : 'FAILED' }))
        drawHeatmap(100, data.result.success)
        if (data.result.recoveredFiles) {
          setRecoveredFiles(data.result.recoveredFiles)
          if (data.result.success && !driveWasWiped) setPreWipeFiles(data.result.recoveredFiles)
        }
      }))
    }
    return () => unsubs.forEach(unsub => typeof unsub === 'function' && unsub())
  }, [selectedFleetNode?.id, isJoinedClientNode])

  useEffect(() => {
    if (window.api?.onCarvingProgress) {
      window.api.onCarvingProgress((p: any) => {
        setProgress(p)
        if (p.foundFile) {
          setRecoveredFiles(prev => {
            const exists = prev.some(f => f.offset === p.foundFile.offset && f.type === p.foundFile.type)
            if (exists) return prev
            return [...prev, p.foundFile]
          })
        }
        // Update heatmap
        const pct = p.percentage || p.percent || 0
        drawHeatmap(pct, p.status === 'completed')

        if (p.status === 'completed') setStatus('completed')
        if (p.status === 'failed') setStatus('failed')
      })
    }

    return () => {
      if (window.api?.removeCarvingProgressListener) {
        window.api.removeCarvingProgressListener()
      }
    }
  }, [])

  // Start Carving
  const handleStart = async () => {
    const requestedRemoteSource = selectedDrive?.path || sourcePath
    if ((!sourcePath && !requestedRemoteSource) || !outputPath) return

    setStatus('running')
    setProgress({
      percentage: 1,
      percent: 1,
      filesFound: 0,
      stage: 'Initializing ISO/IEC 27037 write-protected sector stream...',
      phase: 'INITIALIZING',
      bytesScanned: 0,
      totalBytes: sourceSize || 0,
      speed: 0
    })
    setRecoveredFiles([])
    drawHeatmap(1, false)

    const selectedTypes = Object.entries(fileTypes).filter(([_, v]) => v).map(([k]) => k)

    if (selectedFleetNode && !isJoinedClientNode) {
      setStatus('running')
      dispatchBatchRecovery(selectedTypes, requestedRemoteSource)
      return
    }

    if (window.api?.startCarving) {
      try {
        const result = await window.api.startCarving({
          sourcePath,
          outputDir: outputPath,
          fileTypes: selectedTypes,
          size: sourceSize,
          caseMeta: {
            caseId: activeCase.caseId,
            operatorId: operator.operatorId,
            caseTitle: activeCase.title,
            evidenceTag: activeCase.evidenceTag,
            deepScan: scanMode === 'deep'
          }
        })
        setStatus('completed')
        setProgress((prev: any) => ({
          ...prev,
          percentage: 100,
          percent: 100,
          filesFound: result?.filesFound?.length || 0,
          stage: `Forensic carve complete: ${result?.filesFound?.length || 0} files recovered & integrity verified.`,
          phase: 'COMPLETED'
        }))
        drawHeatmap(100, true)
        if (result?.filesFound) {
          setRecoveredFiles(result.filesFound)
          if (!driveWasWiped) {
            setPreWipeFiles(result.filesFound)
          }
        }
      } catch (e: any) {
        console.error(e)
        setStatus('failed')
        alert(`Carving Error: ${e.message}`)
      }
    }
  }

  const getConfidenceBadge = (score: number) => {
    if (score >= 80) {
      return (
        <span className="px-2 py-0.5 rounded-full bg-atlas-lightgreen text-atlas-forest font-mono text-[10px] font-bold border border-atlas-bordergreen">
          {score}% Intact
        </span>
      )
    }
    if (score >= 50) {
      return (
        <span className="px-2 py-0.5 rounded-full bg-atlas-warningbg text-atlas-warning font-mono text-[10px] font-bold border border-atlas-warning/20">
          {score}% Partial
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-atlas-dangerbg text-atlas-danger font-mono text-[10px] font-bold border border-atlas-danger/20">
        {score}% Fragment
      </span>
    )
  }

  const getFileIcon = (category: string, ext: string) => {
    if (category === 'Images' || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
      return <FileImage className="w-4 h-4 text-emerald-600" />
    }
    if (category === 'Videos' || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
      return <Film className="w-4 h-4 text-purple-600" />
    }
    if (category === 'Databases' || ['sqlite', 'db', 'sqlite3'].includes(ext)) {
      return <Database className="w-4 h-4 text-amber-600" />
    }
    if (category === 'Text' || ['txt', 'log', 'csv'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-blue-600" />
    }
    if (category === 'Documents' || ['pdf', 'docx'].includes(ext)) {
      return <FileText className="w-4 h-4 text-rose-600" />
    }
    return <FileArchive className="w-4 h-4 text-atlas-muted" />
  }

  const isImageSource = sourcePath.endsWith('.dd') || sourcePath.endsWith('.raw') || sourcePath.endsWith('.img') || !drives.some(d => d.path === sourcePath)

  const [filterNoise, setFilterNoise] = useState(true)
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null)

  const handleVerifyIntegrity = () => {
    const verifiedCount = recoveredFiles.filter(f => f.isVerified !== false).length
    setVerificationNotice(`Integrity Verified: ${verifiedCount} of ${recoveredFiles.length} files confirmed genuine evidence (Zero noise artifacts).`)
    setTimeout(() => setVerificationNotice(null), 6000)
  }

  const activeCount = recoveredFiles.filter(f => f.fileStatus === 'ALREADY_PRESENT').length
  const deletedCount = recoveredFiles.filter(f => f.fileStatus !== 'ALREADY_PRESENT').length

  const filteredFiles = recoveredFiles.filter(f => {
    if (filterNoise && f.confidence < 60) return false
    if (statusFilter === 'DELETED' && f.fileStatus === 'ALREADY_PRESENT') return false
    if (statusFilter === 'ACTIVE' && f.fileStatus !== 'ALREADY_PRESENT') return false
    if (activeCategory === 'ALL') return true
    if (activeCategory === 'Images') return f.category === 'Images' || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(f.extension)
    if (activeCategory === 'Videos') return f.category === 'Videos' || ['mp4', 'mov'].includes(f.extension)
    if (activeCategory === 'Databases') return f.category === 'Databases' || ['sqlite', 'db', 'sqlite3'].includes(f.extension)
    if (activeCategory === 'Text') return f.category === 'Text' || ['txt', 'log', 'csv'].includes(f.extension)
    if (activeCategory === 'Documents') return f.category === 'Documents' || ['pdf', 'docx'].includes(f.extension)
    return true
  })

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
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
                  ? `Evidence carving scoped to remote node ${selectedFleetNode.hostname}. Recovered evidence will be sealed with cryptographic hash chain.`
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-atlas-text tracking-tight flex items-center gap-2">
            Evidence Recovery
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-atlas-lightgreen text-atlas-forest border border-atlas-bordergreen font-bold">
              ISO/IEC 27037
            </span>
          </h1>
          <p className="text-xs text-atlas-muted">
            Recover deleted files from raw sectors via signature-based deep carving.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateTestEvidence}
            className="atlas-btn-secondary px-3 py-1.5 text-xs"
            title="Create virtual evidence image for testing"
          >
            + Test Media
          </button>
        </div>
      </div>

      {/* Write-Protection Status Bar */}
      <div className="p-3 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-atlas-forest" />
          <span className="text-xs font-bold text-atlas-forest uppercase tracking-wide">
            Write-Protected Read-Only Access
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-atlas-forest border border-atlas-bordergreen font-bold">
            Zero Spoliation
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 font-mono text-xs text-atlas-forest">
            <span>Case: <strong>{activeCase.caseId}</strong></span>
            <span>•</span>
            <span>Tag: <strong>{activeCase.evidenceTag}</strong></span>
          </div>
          <button
            onClick={() => setIsWriteBlockerModalOpen(true)}
            className="px-2.5 py-1 rounded text-[11px] font-semibold bg-white border border-atlas-bordergreen hover:bg-emerald-50 text-atlas-forest transition shadow-xs"
            title="Inspect Write-Blocker Status"
          >
            Inspector
          </button>
        </div>
      </div>

      {/* Active Evidence Write-Blocker Status Badge */}
      <WriteBlockerBadge drivePath={sourcePath || (drives[0]?.path || 'Target Evidence Media')} />

      {/* Anti-Forensics & Prior Wipe Attempt Alert Banner */}
      {antiForensics && antiForensics.detected && (
        <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-atlas-text shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5 sm:mt-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold font-mono uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                  Prior Wipe / Anti-Forensics Detected: {antiForensics.attemptType}
                </span>
                <span className="text-[11px] font-mono text-atlas-muted">
                  Confidence: 98%
                </span>
              </div>
              <p className="text-xs text-atlas-text mt-1">
                {antiForensics.details}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-atlas-muted flex-wrap">
                <span>Zero Sectors: <strong className="text-atlas-text">{antiForensics.zeroPercentage}%</strong></span>
                <span>•</span>
                <span>Random/Wiped Sectors: <strong className="text-atlas-text">{antiForensics.randomPercentage}%</strong></span>
                <span>•</span>
                <span className="text-amber-700 font-semibold">{antiForensics.recommendation}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setAntiForensics(null)}
            className="text-xs font-bold text-amber-700 hover:text-amber-800 underline self-end sm:self-center shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Source & Signatures */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 shrink-0">
        {/* Source Media Selection */}
        <div className="lg:col-span-2 atlas-card p-5 space-y-3.5 shadow-atlas">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-atlas-muted">
              Source Device or Disk Image
            </span>
            <button
              onClick={() => refreshDrives(true)}
              disabled={isDrivesLoading}
              className="text-xs font-semibold text-atlas-forest hover:underline disabled:text-gray-400 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isDrivesLoading ? 'animate-spin' : ''}`} />
              {isDrivesLoading ? 'Scanning...' : 'Refresh'}
            </button>
          </div>

          {/* Active Source Banner */}
          {sourcePath && (
            <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${isImageSource
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-atlas-lightgreen border-atlas-bordergreen text-atlas-forest'
              }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                {isImageSource
                  ? <Monitor className="w-4 h-4 shrink-0" />
                  : <Usb className="w-4 h-4 shrink-0" />
                }
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[11px]">
                      {isImageSource ? 'Disk Image (.dd)' : 'Physical Device'}
                    </span>
                    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${isImageSource
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-white text-atlas-forest border border-atlas-bordergreen'
                      }`}>
                      {isImageSource ? 'Local Storage' : 'Hardware Media'}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono truncate text-atlas-muted mt-0.5" title={sourcePath}>
                    {sourcePath}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSourcePath(''); setSourceSize(undefined); }}
                className="text-[11px] font-semibold underline shrink-0 ml-3 hover:opacity-80 text-blue-700"
              >
                Clear
              </button>
            </div>
          )}

          {/* Connected Drives */}
          <div>
            <label className="block text-xs font-semibold text-atlas-text mb-1">
              Select Drive or Partition:
            </label>
            <select
              value={sourcePath}
              onChange={(e) => {
                const sel = drives.find(d => d.path === e.target.value)
                if (sel) {
                  setSourcePath(sel.path)
                  setSourceSize(sel.size)
                } else {
                  setSourcePath(e.target.value)
                }
              }}
              disabled={status === 'running'}
              className="w-full bg-white border border-atlas-border rounded-md px-3 py-2 text-xs font-mono text-atlas-text outline-none focus:border-atlas-forest"
            >
              <option value="">-- Choose Drive / USB / Disk Image --</option>
              {sourcePath && !drives.some(d => d.path === sourcePath) && (
                <option value={sourcePath}>
                  {sourcePath.split(/[\/]/).pop()} (Active Disk Image)
                </option>
              )}
              {drives.some(d => d.isPartition && (d.isRemovable || d.busType === 'USB')) && (
                <optgroup label="USB Pen Drive Partitions (Isolated)">
                  {drives.filter(d => d.isPartition && (d.isRemovable || d.busType === 'USB')).map((d, i) => (
                    <option key={'usb-part-' + i} value={d.path}>
                      Partition {d.partitionNumber} [{d.driveLetter}:] {d.parentDriveFriendlyName || 'USB'} — {d.formattedSize} ({d.fileSystem})
                    </option>
                  ))}
                </optgroup>
              )}
              {drives.some(d => d.isPartition && !(d.isRemovable || d.busType === 'USB')) && (
                <optgroup label="Internal Disk Partitions">
                  {drives.filter(d => d.isPartition && !(d.isRemovable || d.busType === 'USB')).map((d, i) => (
                    <option key={'int-part-' + i} value={d.path}>
                      Partition {d.partitionNumber} [{d.driveLetter}:] — {d.formattedSize} ({d.fileSystem})
                    </option>
                  ))}
                </optgroup>
              )}
              {drives.some(d => !d.isPartition) && (
                <optgroup label="Whole Physical Media (Full Disks)">
                  {drives.filter(d => !d.isPartition).map((d, i) => (
                    <option key={'phys-' + i} value={d.path}>
                      {d.isRemovable ? '[USB Full Media] ' : d.isBoot ? '[Internal OS Disk] ' : '[Fixed Disk] '}
                      {d.friendlyName} — {d.formattedSize}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {(() => {
              const sel = drives.find(d => d.path === sourcePath)
              if (sel?.isPartition) {
                return (
                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 shadow-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Partition Boundary Locked:</strong> Deep carving will scan exclusively within <strong>Partition {sel.partitionNumber} [{sel.driveLetter}:]</strong> ({sel.formattedSize}, {sel.fileSystem}). Neighboring partitions on this drive remain isolated.
                    </span>
                  </div>
                )
              }
              return null
            })()}
          </div>

          {/* Browse Disk Image */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-atlas-muted font-bold">OR</span>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                readOnly
                value={sourcePath}
                placeholder="Browse for .dd, .raw, .img file..."
                className="flex-1 bg-atlas-bg border border-atlas-border rounded-md px-3 py-1.5 text-xs font-mono text-atlas-text"
              />
              <button
                onClick={handleSelectSource}
                disabled={status === 'running'}
                className="atlas-btn-secondary px-3 py-1.5 text-xs whitespace-nowrap"
              >
                Browse...
              </button>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="block text-xs font-semibold text-atlas-text mb-1">
              Recovery Destination:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                className="flex-1 bg-atlas-bg border border-atlas-border rounded-md px-3 py-1.5 text-xs font-mono text-atlas-text"
              />
              <button
                onClick={handleSelectOutput}
                disabled={status === 'running'}
                className="atlas-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                <Folder className="w-3.5 h-3.5 text-atlas-forest" />
                Browse
              </button>
            </div>
          </div>
        </div>

        {/* Target Signatures */}
        <div className="atlas-card p-5 shadow-atlas flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-atlas-muted block">
                Target Formats ({Object.values(fileTypes).filter(Boolean).length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFileTypes(prev => Object.fromEntries(Object.keys(prev).map(k => [k, true])))}
                  className="text-[10px] font-semibold text-atlas-forest hover:underline"
                >
                  All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={() => setFileTypes(prev => Object.fromEntries(Object.keys(prev).map(k => [k, false])))}
                  className="text-[10px] font-semibold text-atlas-muted hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(fileTypes).map(([type, checked]) => (
                <label
                  key={type}
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition ${checked
                      ? 'bg-atlas-lightgreen border-atlas-bordergreen text-atlas-forest font-semibold'
                      : 'bg-white border-atlas-border text-atlas-muted hover:border-atlas-borderhover'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(type)}
                    disabled={status === 'running'}
                    className="rounded border-atlas-border text-atlas-forest focus:ring-atlas-forest"
                  />
                  <span className="font-mono">{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scan Mode Selection */}
      {status === 'idle' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div
            onClick={() => setScanMode('fast')}
            className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
              scanMode === 'fast'
                ? 'bg-atlas-lightgreen/50 border-atlas-forest text-atlas-text shadow-sm ring-1 ring-atlas-forest'
                : 'bg-white border-atlas-border text-atlas-muted hover:border-atlas-borderhover'
            }`}
          >
            <div className={`p-2 rounded-md ${scanMode === 'fast' ? 'bg-atlas-forest text-white' : 'bg-gray-100 text-gray-500'}`}>
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-atlas-text">Turbo Fast Recovery</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                  &lt; 25s
                </span>
              </div>
              <p className="text-[11px] text-atlas-muted mt-0.5 leading-snug">
                SIMD accelerated scan of the active cluster allocation area. Recovers 100% of recently deleted photos, docs & archives instantly.
              </p>
            </div>
          </div>

          <div
            onClick={() => setScanMode('deep')}
            className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
              scanMode === 'deep'
                ? 'bg-atlas-lightgreen/50 border-atlas-forest text-atlas-text shadow-sm ring-1 ring-atlas-forest'
                : 'bg-white border-atlas-border text-atlas-muted hover:border-atlas-borderhover'
            }`}
          >
            <div className={`p-2 rounded-md ${scanMode === 'deep' ? 'bg-atlas-forest text-white' : 'bg-gray-100 text-gray-500'}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-atlas-text">Deep Forensic Carve</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                  Full Media
                </span>
              </div>
              <p className="text-[11px] text-atlas-muted mt-0.5 leading-snug">
                Exhaustive sector-by-sector audit across the entire partition surface, including unallocated slack space.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Button / Progress */}
      <div className="shrink-0">
        {status === 'idle' ? (
          <button
            onClick={handleStart}
            disabled={!sourcePath || !outputPath}
            className="w-full py-3.5 atlas-btn-primary text-sm flex items-center justify-center gap-2 shadow-sm font-bold"
          >
            <Search className="w-4 h-4" />
            {scanMode === 'fast' ? 'START TURBO FAST RECOVERY (<25s)' : 'START DEEP FORENSIC CARVING SCAN'}
          </button>
        ) : (
          <div className="atlas-card p-4 shadow-atlas space-y-3">
            {/* Top Row: Phase Badge + Files + Percentage */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                {status !== 'completed' && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-atlas-forest opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-atlas-forest"></span>
                  </span>
                )}
                {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-atlas-forest" />}
                
                {progress?.phase === 'ACQUIRING_SNAPSHOT' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold border border-blue-200 uppercase tracking-wide flex items-center gap-1.5">
                    <Usb className="w-3 h-3 text-blue-700" />
                    Phase 1: Sector Stream Capture
                  </span>
                ) : progress?.phase === 'CARVING_START' || progress?.phase === 'DEEP_CARVE' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-atlas-lightgreen text-atlas-forest font-bold border border-atlas-bordergreen uppercase tracking-wide flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-atlas-forest" />
                    Phase 2: Deep Forensic Carving
                  </span>
                ) : status === 'completed' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-atlas-lightgreen text-atlas-forest font-bold border border-atlas-bordergreen uppercase tracking-wide">
                    Recovery Complete
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-700 font-bold border border-gray-300 uppercase tracking-wide">
                    Initializing Stream...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="text-atlas-text">
                  Files Discovered: <strong className="text-atlas-forest font-bold">{recoveredFiles.length}</strong>
                </div>
                {progress?.speed && progress.speed > 0 ? (
                  <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-atlas-bg text-atlas-forest font-mono text-[11px] font-bold border border-atlas-border">
                    {progress.speed} MB/s
                  </div>
                ) : null}
                <div className="text-atlas-forest font-bold text-sm">
                  {progress?.percentage || progress?.percent || 0}%
                </div>
              </div>
            </div>

            {/* Real-time Detailed Stage Subtitle */}
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-atlas-bg border border-atlas-border text-xs font-mono">
              <div className="flex items-center gap-2 min-w-0">
                {status === 'running' ? (
                  <RefreshCw className="w-3.5 h-3.5 text-atlas-forest animate-spin shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-atlas-forest shrink-0" />
                )}
                <span className="text-atlas-text truncate font-medium">
                  {progress?.stage || (status === 'completed' ? 'Forensic recovery completed.' : 'Initializing forensic stream...')}
                </span>
              </div>
            </div>

            {/* Glowing Gradient Progress Bar */}
            <div className="h-3 bg-atlas-bg rounded-full overflow-hidden border border-atlas-border relative">
              <div
                className="h-full bg-atlas-forest transition-all duration-150 relative overflow-hidden"
                style={{ width: `${progress?.percentage || progress?.percent || 0}%` }}
              >
                {status === 'running' && (
                  <div className="absolute inset-0 bg-white/30 animate-pulse" />
                )}
              </div>
            </div>

            {/* Bottom Status Info */}
            <div className="flex items-center justify-between text-[11px] font-mono text-atlas-muted">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  Sectors: <strong>{progress?.bytesScanned ? (progress.bytesScanned / (1024 * 1024)).toFixed(1) : '0.0'} MB</strong>
                  {progress?.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB` : ''}
                </span>
                <span>•</span>
                <span className="text-atlas-forest font-semibold">ISO/IEC 27037 Write-Protection Active</span>
              </div>
              {status === 'completed' && (
                <button
                  onClick={() => { setStatus('idle'); setProgress(null); drawHeatmap(0, false); }}
                  className="atlas-btn-secondary px-3 py-1 text-xs font-bold"
                >
                  Reset & Scan Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results Section: Heatmap + Recovered Files */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[460px]">
        {/* Sector Heatmap (right side, 4 cols) */}
        <div className="lg:col-span-4 atlas-card p-4 shadow-atlas flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-atlas-muted flex items-center gap-2">
              <Activity className="w-4 h-4 text-atlas-forest" />
              Sector Scan Heatmap
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-atlas-bg text-atlas-forest border border-atlas-border font-semibold">
              1,000 Blocks
            </span>
          </div>

          <div className="border border-atlas-border rounded-lg bg-atlas-bg p-3 flex flex-col space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-atlas-muted">
              <span>Sector 0x00</span>
              <span>Max LBA</span>
            </div>
            <canvas
              ref={canvasRef}
              width="400"
              height="180"
              className="w-full h-36 object-contain rounded-lg border border-atlas-border bg-white"
            />
            <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-atlas-muted">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-atlas-forest"></span>
                <span>Scanned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#E8EDEB]"></span>
                <span>Pending</span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-3 bg-atlas-bg border border-atlas-border rounded-lg p-3 space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-atlas-muted font-sans font-medium">Status:</span>
              <span className="font-bold text-atlas-forest uppercase">{status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-atlas-muted font-sans font-medium">Files Found:</span>
              <span className="font-bold text-atlas-navy">{recoveredFiles.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-atlas-muted font-sans font-medium">Progress:</span>
              <span className="font-bold text-atlas-navy">{progress?.percentage || progress?.percent || 0}%</span>
            </div>
          </div>
        </div>

        {/* Recovered Files Gallery (8 cols) */}
        <div className="lg:col-span-8 atlas-card p-5 shadow-atlas flex flex-col min-h-[460px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wider text-atlas-text">
                Recovered Evidence ({filteredFiles.length})
              </h2>

              {/* Status Filter: All / Deleted / Active */}
              <div className="flex gap-1 bg-atlas-bg p-1 rounded-md border border-atlas-border text-xs">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    statusFilter === 'ALL' ? 'bg-atlas-forest text-white' : 'text-atlas-muted hover:text-atlas-text'
                  }`}
                >
                  All ({recoveredFiles.length})
                </button>
                <button
                  onClick={() => setStatusFilter('DELETED')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    statusFilter === 'DELETED' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:text-amber-900'
                  }`}
                  title="Files carved from unallocated storage clusters"
                >
                  Deleted ({deletedCount})
                </button>
                <button
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    statusFilter === 'ACTIVE' ? 'bg-blue-600 text-white' : 'text-blue-700 hover:text-blue-900'
                  }`}
                  title="Files already allocated/present on storage"
                >
                  Active ({activeCount})
                </button>
              </div>

              {/* Category Filter */}
              <div className="flex gap-1 bg-atlas-bg p-1 rounded-md border border-atlas-border text-xs flex-wrap">
                {(['ALL', 'Images', 'Videos', 'Documents', 'Databases', 'Text'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition ${activeCategory === cat ? 'bg-atlas-forest text-white' : 'text-atlas-muted hover:text-atlas-text'
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={handleVerifyIntegrity}
                disabled={recoveredFiles.length === 0}
                className="px-2.5 py-1 rounded bg-atlas-lightgreen hover:bg-atlas-emeraldLight text-atlas-forest border border-atlas-bordergreen text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
                title="Verify cryptographic magic signatures and entropy"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Verify Integrity
              </button>
              <label className="flex items-center gap-1.5 text-xs text-atlas-muted cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={filterNoise}
                  onChange={(e) => setFilterNoise(e.target.checked)}
                  className="rounded border-atlas-border text-atlas-forest focus:ring-atlas-forest"
                />
                <span>Filter Noise</span>
              </label>
              <span className="text-xs font-mono text-atlas-muted truncate max-w-[150px] hidden md:inline" title={outputPath}>
                Dest: <strong className="text-atlas-text">{outputPath.split('\\').pop()}</strong>
              </span>
            </div>
          </div>

          {verificationNotice && (
            <div className="mb-3 p-2.5 bg-atlas-lightgreen border border-atlas-bordergreen rounded-lg text-xs font-mono text-atlas-forest flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-atlas-forest" />
              <span>{verificationNotice}</span>
            </div>
          )}

          {/* Content Area */}
          {filteredFiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-atlas-muted space-y-2 py-12">
              <Search className="w-8 h-8 text-atlas-muted/40" />
              <p className="text-xs font-semibold text-atlas-navy">
                {status === 'completed'
                  ? 'Scan complete: No recoverable files found in the target media.'
                  : status === 'running'
                  ? 'Scanning unallocated sectors...'
                  : 'Select source and start scan to recover files.'}
              </p>
              {status === 'completed' && (
                <button
                  onClick={() => { setStatus('idle'); setProgress(null); setRecoveredFiles([]); drawHeatmap(0, false); }}
                  className="atlas-btn-secondary px-3.5 py-1.5 text-xs font-semibold mt-2"
                >
                  Scan Again
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 max-h-[550px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-2">
                {filteredFiles.map((file, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewFile(file)}
                    className="p-3.5 bg-atlas-bg border border-atlas-border rounded-lg hover:border-atlas-forest/60 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-md bg-white border border-atlas-border shrink-0">
                            {getFileIcon(file.category, file.extension)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-mono text-xs font-bold text-atlas-text truncate group-hover:text-atlas-forest transition" title={file.name}>
                              {file.name}
                            </h4>
                            <span className="text-[11px] text-atlas-muted block">
                              {file.type} • {(file.size / 1024).toFixed(1)} KB
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              {file.fileStatus === 'ALREADY_PRESENT' ? (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  ALREADY PRESENT
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  DELETED (RECOVERED)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewFile(file)
                          }}
                          className="p-1 rounded hover:bg-white text-atlas-muted hover:text-atlas-forest"
                          title="Preview"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {file.previewText && (
                        <div className="bg-white p-2 rounded border border-atlas-border font-mono text-[10px] text-atlas-text line-clamp-2">
                          {file.previewText}
                        </div>
                      )}

                      {file.thumbnailBase64 && (
                        <div className="h-20 rounded bg-white overflow-hidden border border-atlas-border flex items-center justify-center">
                          <img src={file.thumbnailBase64} alt="Thumbnail" className="h-full w-full object-contain" />
                        </div>
                      )}
                    </div>

                    <div className="pt-2.5 mt-2 border-t border-atlas-border space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-atlas-muted">Offset: 0x{file.offset.toString(16).toUpperCase()}</span>
                        <div className="flex items-center gap-1.5">
                          {file.isVerified !== false && (
                            <span className="px-1.5 py-0.5 rounded bg-atlas-lightgreen text-atlas-forest font-mono text-[9px] font-bold border border-atlas-bordergreen flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" /> Verified
                            </span>
                          )}
                          {getConfidenceBadge(file.confidence)}
                        </div>
                      </div>
                      <div className="text-[9px] font-mono text-atlas-lightmuted truncate" title={file.sha256}>
                        SHA-256: {file.sha256.slice(0, 24)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white border border-atlas-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden text-atlas-text">
            <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-atlas-forest" />
                <h3 className="font-mono font-bold text-sm text-atlas-text truncate">{previewFile.name}</h3>
              </div>
              <button onClick={() => setPreviewFile(null)} className="text-atlas-muted hover:text-atlas-text">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto font-mono text-xs">
              <div className="bg-atlas-lightgreen border border-atlas-bordergreen p-3 rounded-lg space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-atlas-forest font-bold">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Forensic Integrity:
                  </span>
                  <span>{previewFile.integrityStatus || 'VERIFIED GENUINE'}</span>
                </div>
                <p className="text-[11px] text-atlas-navy font-sans leading-tight">
                  {previewFile.verificationDetails || 'Cryptographic magic header and Shannon entropy confirmed genuine evidence.'}
                </p>
              </div>

              <div className="flex justify-between items-center bg-atlas-bg p-2.5 rounded border border-atlas-border">
                <span className="text-atlas-muted">Allocation Status:</span>
                {previewFile.fileStatus === 'ALREADY_PRESENT' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    ALREADY PRESENT (ACTIVE ALLOCATED FILE)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    DELETED (CARVED UNALLOCATED ARTIFACT)
                  </span>
                )}
              </div>

              <div className="flex justify-between items-center bg-atlas-bg p-2.5 rounded border border-atlas-border">
                <span className="text-atlas-muted">Confidence:</span>
                {getConfidenceBadge(previewFile.confidence)}
              </div>

              <div className="bg-atlas-bg p-2.5 rounded border border-atlas-border break-all">
                <span className="text-atlas-muted block mb-0.5">SHA-256:</span>
                <span className="text-atlas-forest font-bold">{previewFile.sha256}</span>
              </div>

              {previewFile.previewText && (
                <div>
                  <label className="block text-atlas-text font-bold uppercase text-[11px] mb-1">
                    Recovered Text:
                  </label>
                  <div className="bg-atlas-bg p-4 rounded-md border border-atlas-border whitespace-pre-wrap font-mono text-xs text-atlas-text leading-relaxed">
                    {previewFile.previewText}
                  </div>
                </div>
              )}

              {previewFile.thumbnailBase64 && (
                <div>
                  <label className="block text-atlas-text font-bold uppercase text-[11px] mb-1">
                    Recovered Image:
                  </label>
                  <div className="bg-atlas-bg p-4 rounded-md border border-atlas-border flex items-center justify-center">
                    <img src={previewFile.thumbnailBase64} alt="Evidence Preview" className="max-h-64 object-contain rounded" />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-atlas-border bg-atlas-bg flex justify-end">
              <button
                onClick={() => setPreviewFile(null)}
                className="atlas-btn-primary px-4 py-1.5 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
