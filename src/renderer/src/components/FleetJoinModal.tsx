import React, { useState } from 'react'
import {
  Network,
  X,
  Key,
  Laptop,
  HardDrive,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Radio,
  CheckCircle2,
  RefreshCw
} from 'lucide-react'
import { useCase } from '../context/CaseContext'

export const FleetJoinModal: React.FC = () => {
  const {
    isFleetJoinModalOpen,
    setIsFleetJoinModalOpen,
    joinFleetWorkspace
  } = useCase()

  const [hostIp, setHostIp] = useState('127.0.0.1')
  const [port, setPort] = useState('4096')
  const [roomKey, setRoomKey] = useState('')
  const [clientName, setClientName] = useState('Workstation-Node-02')
  const [storageMedia, setStorageMedia] = useState('512 GB NVMe (Samsung 980 PRO)')
  const [isConnecting, setIsConnecting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isFleetJoinModalOpen) return null

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomKey.trim()) {
      setErrorMsg('Please enter a valid fleet workspace room key.')
      return
    }

    setErrorMsg(null)
    setIsConnecting(true)

    try {
      const res = await joinFleetWorkspace({
        hostIp: hostIp.trim(),
        port: parseInt(port.trim(), 10) || 4096,
        roomCode: roomKey.trim().toUpperCase(),
        clientName: clientName.trim(),
        storage: storageMedia.trim()
      })

      if (res.success) {
        setIsFleetJoinModalOpen(false)
      } else {
        setErrorMsg(res.error || 'Failed to authenticate with fleet host. Verify IP and Room Key.')
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection error occurred.')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white border border-atlas-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-atlas-text">
        {/* Header */}
        <div className="px-6 py-4 border-b border-atlas-border flex items-center justify-between bg-atlas-bg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-bold text-base text-atlas-navy">
                Join Central Fleet Workspace
              </h2>
              <p className="text-xs text-atlas-muted">
                Connect this workstation to the central coordinator mesh
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setIsFleetJoinModalOpen(false)
              setErrorMsg(null)
            }}
            className="text-atlas-muted hover:text-atlas-navy p-1 rounded-md hover:bg-atlas-border transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleJoin} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Room Key Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-atlas-navy flex items-center justify-between">
              <span>Fleet Workspace Room Key <span className="text-red-500">*</span></span>
              <span className="text-[10px] text-atlas-muted font-normal">Provided by Central Host</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-atlas-muted">
                <Key className="w-4 h-4 text-emerald-600" />
              </div>
              <input
                type="text"
                required
                value={roomKey}
                onChange={(e) => setRoomKey(e.target.value)}
                placeholder="e.g. CS-FLEET-8492"
                className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold uppercase tracking-wider border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
              />
            </div>
          </div>

          {/* Network Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-atlas-navy">
                Host IP / Domain <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-atlas-muted">
                  <Network className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  required
                  value={hostIp}
                  onChange={(e) => setHostIp(e.target.value)}
                  placeholder="127.0.0.1 or 192.168.1.x"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-atlas-navy">
                Port
              </label>
              <input
                type="number"
                required
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="4096"
                className="w-full px-3 py-2 text-xs font-mono border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
              />
            </div>
          </div>

          {/* Workstation Identity */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-atlas-navy">
                Workstation Hostname
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-atlas-muted">
                  <Laptop className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-atlas-navy">
                Target Storage Media
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-atlas-muted">
                  <HardDrive className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  required
                  value={storageMedia}
                  onChange={(e) => setStorageMedia(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-atlas-border rounded-lg focus:border-atlas-forest focus:outline-none bg-atlas-bg"
                />
              </div>
            </div>
          </div>

          {/* Info pill */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Offline Direct WebSocket Protocol</span>
            </div>
            <p className="text-[11px] text-emerald-700 leading-relaxed">
              Upon joining, this workstation syncs the workspace configured by the central operator and executes synchronized audit, wipe, or recovery commands in real-time.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-atlas-border">
            <button
              type="button"
              onClick={() => {
                setIsFleetJoinModalOpen(false)
                setErrorMsg(null)
              }}
              className="atlas-btn-secondary px-4 py-2 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isConnecting}
              className="atlas-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-2 disabled:opacity-50 shadow-xs"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting to Central Host...</span>
                </>
              ) : (
                <>
                  <span>Join Workspace & Enter</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FleetJoinModal

