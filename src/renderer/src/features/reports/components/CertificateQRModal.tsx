import React from 'react'
import { QrCode, X, ShieldCheck, Smartphone } from 'lucide-react'

interface CertificateQRModalProps {
  isOpen: boolean
  onClose: () => void
  certId?: string
  qrDataUrl?: string
}

export const CertificateQRModal: React.FC<CertificateQRModalProps> = ({
  isOpen,
  onClose,
  certId = 'CERT-2026-NIST-001',
  qrDataUrl
}) => {
  if (!isOpen) return null

  // Fallback demo QR if no data URL generated yet
  const verifyUrl = `http://localhost:3847/verify?id=${encodeURIComponent(certId)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-atlas-card border border-atlas-border rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-atlas-muted hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
          <QrCode className="w-6 h-6 text-emerald-400" />
        </div>

        <h3 className="text-base font-bold text-white uppercase tracking-wide">
          Live Judge Attestation Scan
        </h3>
        <p className="text-xs text-atlas-muted mt-1 mb-4">
          Scan with your smartphone camera to independently verify the Ed25519 digital signature.
        </p>

        {/* QR Code Container */}
        <div className="bg-white p-4 rounded-xl shadow-inner inline-block mx-auto mb-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Certificate Verification QR" className="w-44 h-44 object-contain" />
          ) : (
            <div className="w-44 h-44 bg-slate-100 flex flex-col items-center justify-center text-slate-800 p-2">
              <QrCode className="w-24 h-24 text-slate-800 mb-2" />
              <span className="text-[10px] font-mono break-all text-center">{verifyUrl}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-left text-xs font-mono mb-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Verification Link</span>
          </div>
          <div className="text-slate-400 text-[11px] truncate">
            {verifyUrl}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>Ed25519 Cryptographically Anchored</span>
        </div>
      </div>
    </div>
  )
}

export default CertificateQRModal
