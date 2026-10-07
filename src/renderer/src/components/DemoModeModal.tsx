import React, { useState } from 'react'
import { Play, Check, ChevronRight, ChevronLeft, X, Shield, Search, HardDrive, FileCheck2 } from 'lucide-react'

interface DemoModeModalProps {
  isOpen: boolean
  onClose: () => void
  onNavigateToTab?: (tab: string) => void
}

export const DemoModeModal: React.FC<DemoModeModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab
}) => {
  const [currentStep, setCurrentStep] = useState(1)

  if (!isOpen) return null

  const steps = [
    {
      step: 1,
      title: 'Deep Sector Data Retrieval (Recovery)',
      tab: 'recovery',
      icon: Search,
      description: 'Run deep sector file recovery on formatted storage media with write-blocker active.',
      talkingPoint: '"Notice that even after quick formatting, our engine reconstructs deleted documents and images directly from raw sectors."'
    },
    {
      step: 2,
      title: 'NIST SP 800-88 Certified Sanitization',
      tab: 'drive-eraser',
      icon: HardDrive,
      description: 'Execute a verified NIST Clear zero-overwrite across all storage clusters with live sector heatmap.',
      talkingPoint: '"We overwrite 100% of clusters to ENOSPC, dropping Shannon entropy from 7.9 to 0.0000."'
    },
    {
      step: 3,
      title: 'Data Concealment & Integrity Audit',
      tab: 'recovery',
      icon: Shield,
      description: 'Re-run carving against the sanitized drive to prove mathematical erasure and non-recoverability.',
      talkingPoint: '"Zero recoverable files remain. Magic byte absence confirms complete destruction."'
    },
    {
      step: 4,
      title: 'Cryptographic Compliance Attestation',
      tab: 'reports',
      icon: FileCheck2,
      description: 'Generate and verify an Ed25519-signed certificate with instant smartphone QR code.',
      talkingPoint: '"Evaluators can scan this QR code right now on their phones to verify the detached signature."'
    }
  ]

  const activeStepData = steps[currentStep - 1]
  const Icon = activeStepData.icon

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
      if (onNavigateToTab) {
        onNavigateToTab(steps[currentStep].tab)
      }
    } else {
      onClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      if (onNavigateToTab) {
        onNavigateToTab(steps[currentStep - 2].tab)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white border border-atlas-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-atlas-text">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-atlas-muted hover:text-atlas-navy p-1 rounded-lg hover:bg-atlas-bg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Stepper Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-atlas-lightgreen border border-atlas-bordergreen flex items-center justify-center text-atlas-forest">
            <Play className="w-4 h-4 fill-current" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-atlas-navy uppercase tracking-wide">
              Presentation Guided Stepper
            </h3>
            <p className="text-xs text-atlas-muted">
              Step-by-step presentation walkthrough for evaluators
            </p>
          </div>
        </div>

        {/* Step Counter Pills */}
        <div className="flex gap-2 mb-5">
          {steps.map((s) => (
            <div
              key={s.step}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                s.step === currentStep
                  ? 'bg-atlas-forest'
                  : s.step < currentStep
                  ? 'bg-atlas-green'
                  : 'bg-atlas-border'
              }`}
            />
          ))}
        </div>

        {/* Step Card */}
        <div className="bg-atlas-bg border border-atlas-border rounded-xl p-5 mb-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white border border-atlas-border flex items-center justify-center text-atlas-forest shadow-xs">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-atlas-forest uppercase tracking-wider">
                STAGE {activeStepData.step} OF 4
              </span>
              <h4 className="text-sm font-bold text-atlas-navy">{activeStepData.title}</h4>
            </div>
          </div>

          <p className="text-xs text-atlas-muted leading-relaxed">
            {activeStepData.description}
          </p>

          <div className="bg-white border border-atlas-bordergreen/60 rounded-lg p-3 text-[11px] text-atlas-forest font-medium italic border-l-4 border-l-atlas-forest">
            {activeStepData.talkingPoint}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-2">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="atlas-btn-secondary px-4 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <button
            onClick={handleNext}
            className="atlas-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <span>{currentStep === 4 ? 'Finish Presentation' : 'Next Stage'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default DemoModeModal
