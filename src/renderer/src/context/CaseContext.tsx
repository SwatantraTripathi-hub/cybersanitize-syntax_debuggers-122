import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ApplicationMode = 'SINGLE' | 'MULTI'
export type AppStage =
  | 'DASHBOARD'
  | 'ROOM_CREATION'
  | 'ROOM_CREATED'
  | 'CASE_CREATION'
  | 'MAIN_WORKING_DASHBOARD'

export interface Operator {
  id: string
  name: string
  role: string
}

export interface Room {
  id: string
  name: string
  createdAt: string
}

export interface CaseRecord {
  id: string
  name: string
  operator: string
  evidenceName: string
  description: string
  createdAt: string
  mode: ApplicationMode
  roomId?: string
}

interface CaseContextValue {
  stage: AppStage
  mode: ApplicationMode | null
  operator: Operator
  room: Room | null
  activeCase: CaseRecord | null
  startSingle: () => void
  startMulti: () => void
  cancelFlow: () => void
  createRoom: (name: string) => void
  continueToCase: () => void
  createCase: (
    input: Omit<
      CaseRecord,
      'id' | 'operator' | 'createdAt' | 'mode' | 'roomId'
    >,
  ) => void
  backToDashboard: () => void
}

const DEFAULT_OPERATOR: Operator = {
  id: 'OP-2048',
  name: 'Demo Operator',
  role: 'Forensic Operator',
}

const CaseContext = createContext<CaseContextValue | undefined>(undefined)

function createRoomId() {
  return `CS-ROOM-${Math.random().toString(16).slice(2, 6).toUpperCase()}`
}

export function CaseProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<AppStage>('DASHBOARD')
  const [mode, setMode] = useState<ApplicationMode | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null)

  const value = useMemo<CaseContextValue>(
    () => ({
      stage,
      mode,
      operator: DEFAULT_OPERATOR,
      room,
      activeCase,
      startSingle: () => {
        setMode('SINGLE')
        setRoom(null)
        setStage('CASE_CREATION')
      },
      startMulti: () => {
        setMode('MULTI')
        setActiveCase(null)
        setStage('ROOM_CREATION')
      },
      cancelFlow: () => setStage('DASHBOARD'),
      createRoom: (name: string) => {
        setRoom({
          id: createRoomId(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
        })
        setStage('ROOM_CREATED')
      },
      continueToCase: () => setStage('CASE_CREATION'),
      createCase: (input) => {
        const nextMode = mode ?? 'SINGLE'
        setActiveCase({
          ...input,
          id: `CASE-${String(Date.now()).slice(-4)}`,
          operator: DEFAULT_OPERATOR.name,
          createdAt: new Date().toISOString(),
          mode: nextMode,
          roomId: room?.id,
        })
        setStage('MAIN_WORKING_DASHBOARD')
      },
      backToDashboard: () => {
        setActiveCase(null)
        setMode(null)
        setRoom(null)
        setStage('DASHBOARD')
      },
    }),
    [activeCase, mode, room, stage],
  )

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>
}

export function useCase() {
  const context = useContext(CaseContext)
  if (!context) throw new Error('useCase must be used inside CaseProvider')
  return context
}
