import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { CaseProvider, useCase } from './context/CaseContext'

// Global Dialogs & Modals
import CaseModal from './components/CaseModal'
import FleetCreateModal from './components/FleetCreateModal'
import FleetJoinModal from './components/FleetJoinModal'
import WriteBlockerModal from './components/WriteBlockerModal'

// Primary Screen Views
import OrchestrationLanding from './components/OrchestrationLanding'
import FleetDashboard from './features/fleet/FleetDashboard'
import Layout from './components/Layout'

// Main Engine Operations
import Dashboard from './features/dashboard/Dashboard'
import Recovery from './features/recovery/Recovery'
import DriveEraser from './features/wipe/DriveEraser'
import FileEraser from './features/file-eraser/FileEraser'
import AuditLog from './features/audit/AuditLog'
import Reports from './features/reports/Reports'

const AppContent: React.FC = () => {
  const { orchestrationMode, selectedFleetNode } = useCase()

  return (
    <>
      {orchestrationMode === 'LANDING' ? (
        <OrchestrationLanding />
      ) : orchestrationMode === 'MULTI' && !selectedFleetNode ? (
        <FleetDashboard />
      ) : (
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="recovery" element={<Recovery />} />
            <Route path="drive-eraser" element={<DriveEraser />} />
            <Route path="file-eraser" element={<FileEraser />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="reports" element={<Reports />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}

      {/* Global Interactive Modals */}
      <CaseModal />
      <FleetCreateModal />
      <FleetJoinModal />
      <WriteBlockerModal />
    </>
  )
}

function App() {
  return (
    <CaseProvider>
      <AppContent />
    </CaseProvider>
  )
}

export default App
