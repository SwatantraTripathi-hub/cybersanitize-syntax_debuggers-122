import React, { useEffect, useState, useRef } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  HardDrive, 
  FileX, 
  Search, 
  ClipboardList, 
  FileText, 
  Shield, 
  ChevronDown, 
  FolderPlus, 
  Check, 
  Briefcase,
  ShieldCheck,
  Play,
  Network,
  ArrowLeft,
  Laptop
} from 'lucide-react'
import { useCase } from '../context/CaseContext'

export const Layout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [version, setVersion] = useState('1.0.0')
  const { 
    operator, 
    activeCase, 
    caseList, 
    setActiveCase, 
    setIsCaseModalOpen, 
    setIsWriteBlockerModalOpen, 
    protectedDrives,
    orchestrationMode,
    selectedFleetNode,
    backToFleetOverview,
    backToLanding
  } = useCase()

  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleNavigateTab = (tab: string) => {
    if (tab === 'recovery') navigate('/recovery')
    else if (tab === 'drive-eraser') navigate('/drive-eraser')
    else if (tab === 'reports') navigate('/reports')
    else if (tab === 'audit') navigate('/audit')
    else if (tab === 'file-eraser') navigate('/file-eraser')
    else navigate('/')
  }

  useEffect(() => {
    if (window.api?.getAppVersion) {
      window.api.getAppVersion().then(setVersion).catch(console.warn)
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCaseDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/recovery', label: 'Data Recovery', icon: Search },
    { path: '/drive-eraser', label: 'Drive Sanitizer', icon: HardDrive },
    { path: '/file-eraser', label: 'File Shredder', icon: FileX },
    { path: '/audit', label: 'Audit Trail', icon: ClipboardList },
    { path: '/reports', label: 'Compliance Reports', icon: FileText }
  ]

  return (
    <div className="flex h-screen bg-atlas-bg text-atlas-text overflow-hidden">
      {/* 1. MongoDB Atlas Dark Navy Sidebar */}
      <aside className="w-64 bg-atlas-navy flex flex-col justify-between shrink-0 border-r border-atlas-navydark z-20">
        <div>
          {/* Brand Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-atlas-forest flex items-center justify-center text-atlas-green shadow-xs">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-white text-base tracking-tight block">CyberSanitize</span>
                <span className="text-[10px] text-atlas-lightmuted tracking-wider uppercase font-medium">Enterprise Engine</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-atlas-lightmuted">
              Main Engine Navigation
            </div>

            {/* Special return button if in Fleet Mode */}
            {orchestrationMode === 'MULTI' && (
              <button
                onClick={backToFleetOverview}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide text-emerald-400 bg-white/5 hover:bg-white/10 border-l-4 border-emerald-400 pl-2 transition mb-2"
              >
                <Network className="w-4 h-4 text-emerald-400" />
                <span>Return to Fleet Mesh</span>
              </button>
            )}

            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all group ${
                    isActive
                      ? 'bg-atlas-foresthover text-white border-l-4 border-atlas-green pl-2'
                      : 'text-atlas-lightmuted hover:bg-white/5 hover:text-white border-l-4 border-transparent pl-2'
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-atlas-green' : 'text-atlas-lightmuted group-hover:text-white'}`} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/10 bg-atlas-navydark text-[11px] text-atlas-lightmuted space-y-1.5">
          <div className="flex items-center justify-between text-white/80">
            <span className="text-[10px] uppercase font-bold text-atlas-lightmuted">Operating Engine:</span>
            <span className="font-mono text-atlas-green text-[10px] font-bold">Win32 Native DMA</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-atlas-lightmuted pt-0.5">
            <span>Orchestration:</span>
            <span className="font-bold text-white">
              {orchestrationMode === 'MULTI' ? 'Fleet Node Scope' : 'Standalone Station'}
            </span>
          </div>
        </div>
      </aside>

      {/* 2. Main Workspace Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-atlas-bg">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-atlas-border px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
          {/* Left: Active Workspace Dropdown Selector */}
          <div className="flex items-center gap-4" ref={dropdownRef}>
            <div className="relative">
              <button
                onClick={() => setIsCaseDropdownOpen(!isCaseDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-atlas-bg hover:bg-atlas-border border border-atlas-border hover:border-atlas-borderhover text-xs font-semibold transition text-atlas-text"
              >
                <Briefcase className="w-3.5 h-3.5 text-atlas-forest" />
                <span className="text-atlas-muted font-normal">Active Workspace:</span>
                <span className="font-mono font-bold text-atlas-forest">{activeCase.caseId}</span>
                <ChevronDown className="w-3 h-3 text-atlas-muted" />
              </button>

              {/* Workspace Dropdown Menu */}
              {isCaseDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-80 bg-white border border-atlas-border rounded-xl shadow-atlas-hover p-2 z-50 text-xs animate-fadeIn">
                  <div className="px-2 py-1.5 text-[10px] uppercase font-bold text-atlas-muted border-b border-atlas-border flex justify-between items-center">
                    <span>Recent Workspaces</span>
                    <button
                      onClick={() => {
                        setIsCaseDropdownOpen(false)
                        setIsCaseModalOpen(true)
                      }}
                      className="text-atlas-forest hover:underline font-bold flex items-center gap-1"
                    >
                      <FolderPlus className="w-3 h-3" /> New Workspace
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto py-1 space-y-1">
                    {caseList.map((c) => (
                      <div
                        key={c.caseId}
                        onClick={() => {
                          setActiveCase(c)
                          setIsCaseDropdownOpen(false)
                          navigate('/')
                        }}
                        className={`p-2 rounded-md cursor-pointer flex items-center justify-between transition ${
                          c.caseId === activeCase.caseId
                            ? 'bg-atlas-lightgreen text-atlas-forest font-bold'
                            : 'hover:bg-atlas-bg text-atlas-text'
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-mono text-xs">{c.caseId}</div>
                          <div className="text-[10px] text-atlas-muted truncate max-w-[200px]">{c.title}</div>
                        </div>
                        {c.caseId === activeCase.caseId && <Check className="w-3.5 h-3.5 text-atlas-forest shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Asset Reference Tag */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-atlas-muted bg-atlas-bg px-2.5 py-1 rounded-md border border-atlas-border font-mono">
              <span>Asset:</span>
              <strong className="text-atlas-text">{activeCase.evidenceTag}</strong>
            </div>

            {/* Fleet Node Scope Pill (if applicable) */}
            {selectedFleetNode && (
              <div className="hidden md:flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-200 font-mono">
                <Laptop className="w-3 h-3 text-emerald-600" />
                <span>Node: <strong>{selectedFleetNode.hostname}</strong></span>
              </div>
            )}
          </div>

          {/* Right: Actions & Security Badges */}
          <div className="flex items-center gap-3 text-xs">
            {/* Switch Orchestration button */}
            <button
              onClick={backToLanding}
              className="p-1.5 rounded-lg border border-atlas-border hover:bg-atlas-bg text-atlas-muted hover:text-atlas-navy transition flex items-center gap-1 text-xs font-semibold"
              title="Return to Main Mode Selector (Single vs Multi)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Switch Mode</span>
            </button>

            {/* Write-Protection Interlock Pill */}
            <button
              onClick={() => setIsWriteBlockerModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-atlas-lightgreen border border-atlas-bordergreen text-atlas-forest font-semibold text-[11px] hover:bg-emerald-100 transition shadow-xs"
              title="Inspect ISO/IEC 27037 Write-Protect Guard"
            >
              <span className="w-2 h-2 rounded-full bg-atlas-forest animate-pulse"></span>
              <span>Write-Protect Active</span>
              {protectedDrives.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-white text-atlas-forest rounded-full text-[9px] font-mono font-bold border border-atlas-bordergreen">
                  {protectedDrives.length} Locked
                </span>
              )}
            </button>

            {/* Administrator Profile Button */}
            <button
              onClick={() => setIsCaseModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-atlas-border hover:border-atlas-borderhover bg-atlas-bg text-atlas-text transition font-medium"
              title="View/Update Administrator Profile"
            >
              <div className="w-6 h-6 rounded-full bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="text-left leading-tight hidden md:block">
                <div className="font-mono text-xs font-bold text-atlas-navy">{operator.operatorId}</div>
                <div className="text-[10px] text-atlas-forest font-semibold">{operator.status}</div>
              </div>
            </button>
          </div>
        </header>

        {/* Main Routed Content */}
        <main className="flex-1 overflow-auto p-6 bg-atlas-bg">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
