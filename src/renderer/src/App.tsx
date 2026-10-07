import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Download,
  FileArchive,
  FileSearch,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { CaseProvider, useCase, type AppStage } from './context/CaseContext'

type Page =
  | 'dashboard'
  | 'recovery'
  | 'sanitizer'
  | 'shredder'
  | 'audit'
  | 'reports'
type Tone = 'green' | 'amber' | 'red' | 'gray'
const formats = [
  'PNG',
  'JPEG',
  'WEBP',
  'GIF',
  'MP4',
  'MOV',
  'SQLITE',
  'PDF',
  'DOCX',
  'ZIP',
  'TXT',
  'BMP',
]

function App() {
  return (
    <CaseProvider>
      <Workspace />
    </CaseProvider>
  )
}
function Workspace() {
  const { stage } = useCase()
  const [page, setPage] = useState<Page>('dashboard')
  return (
    <div className="app-shell">
      <Sidebar page={page} navigate={setPage} stage={stage} />
      <main className="workspace">
        <div className="workspace-content">
          {page === 'dashboard' && <Dashboard navigate={setPage} />}
          {page === 'recovery' && <Recovery />}
          {page === 'sanitizer' && <Sanitizer />}
          {page === 'shredder' && <Shredder />}
          {page === 'audit' && <Audit />}
          {page === 'reports' && <Reports />}
        </div>
      </main>
      {stage === 'ROOM_CREATION' && <RoomModal />}
      {stage === 'ROOM_CREATED' && <RoomCreatedModal />}
      {stage === 'CASE_CREATION' && <CaseModal />}
    </div>
  )
}
function Sidebar({
  page,
  navigate,
  stage,
}: {
  page: Page
  navigate: (page: Page) => void
  stage: AppStage
}) {
  const items: [Page, string, ReactNode][] = [
    ['dashboard', 'Dashboard', <LayoutDashboard size={16} />],
    ['recovery', 'Evidence Recovery', <FileSearch size={16} />],
    ['sanitizer', 'Drive Sanitizer', <HardDrive size={16} />],
    ['shredder', 'File Shredder', <FileArchive size={16} />],
    ['audit', 'Audit Ledger', <ClipboardCheck size={16} />],
    ['reports', 'Compliance Reports', <FileText size={16} />],
  ]
  return (
    <aside className="sidebar">
      <div>
        <div className="brand">
          <div className="brand-mark">
            <Shield size={19} />
          </div>
          <div>
            <strong>CyberSanitize</strong>
            <span>Forensic Platform</span>
          </div>
        </div>
        <nav className="side-nav">
          <p>Forensic Navigation</p>
          {items.map(([key, label, icon]) => (
            <button
              key={key}
              className={`nav-item ${page === key ? 'active' : ''}`}
              onClick={() => navigate(key)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer">
        <div className="engine-row">
          <span>Operating Engine</span>
          <strong>FRONTEND DEMO</strong>
        </div>
        <span>Enterprise Version 1.0.0</span>
        {stage !== 'DASHBOARD' && (
          <span className="demo-label">Simulation mode</span>
        )}
      </div>
    </aside>
  )
}
function Layout({
  eyebrow,
  title,
  subtitle,
  action,
  children,
}: {
  eyebrow: string
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action && <div className="page-actions">{action}</div>}
      </div>
      {children}
    </div>
  )
}
function Dashboard({ navigate }: { navigate: (page: Page) => void }) {
  const { activeCase, operator, room, startSingle, startMulti } = useCase()
  return (
    <Layout
      eyebrow="FORENSIC OPERATIONS"
      title="Dashboard"
      subtitle="Manage evidence workspaces, recovery, sanitization, and the audit record."
    >
      {!activeCase && (
        <section className="start-banner">
          <div>
            <span className="eyebrow">NEW WORKSPACE</span>
            <h2>Start a controlled evidence operation</h2>
            <p>
              Choose a mode to register a case. All actions in this frontend are
              simulations.
            </p>
          </div>
          <div className="start-actions">
            <button className="button primary" onClick={startSingle}>
              <LockKeyhole size={15} /> Single case
            </button>
            <button className="button secondary" onClick={startMulti}>
              <Network size={15} /> Multi room
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <Header
          title="Active case"
          icon={<ClipboardCheck size={16} />}
          action={
            <Badge tone={activeCase ? 'green' : 'gray'}>
              {activeCase ? 'ACTIVE WORKSPACE' : 'AWAITING CASE'}
            </Badge>
          }
        />
        <div className="case-grid">
          <Detail
            label="Case ID"
            value={activeCase?.id ?? 'No active case'}
            mono
          />
          <Detail
            label="Case name"
            value={activeCase?.name ?? 'Create a case to begin'}
          />
          <Detail
            label="Evidence"
            value={activeCase?.evidenceName ?? 'Not assigned'}
            mono
          />
          <Detail
            label="Mode"
            value={activeCase?.mode ?? 'Awaiting registration'}
            mono
          />
          <Detail label="Room name" value={room?.name ?? 'Single workspace'} />
          <Detail label="Room ID" value={room?.id ?? 'Not applicable'} mono />
          <Detail label="Target" value="Not connected" />
          <Detail label="Lead examiner" value={operator.name} />
          <Detail
            label="Date"
            value={
              activeCase
                ? formatDate(activeCase.createdAt)
                : 'Awaiting registration'
            }
          />
        </div>
        <div className="case-actions">
          <button
            className="button secondary"
            onClick={activeCase ? () => navigate('reports') : startSingle}
          >
            <FolderOpen size={14} />{' '}
            {activeCase ? 'Switch / Import Case' : 'Register case'}
          </button>
          <button className="button secondary" disabled={!activeCase}>
            <Download size={14} /> Export Case Dossier
          </button>
          <button
            className="button link-button"
            onClick={() => navigate('reports')}
          >
            View certificates <ArrowRight size={14} />
          </button>
        </div>
      </section>
      <div className="scope-row">
        <div>
          <SlidersHorizontal size={15} />
          <b>Metrics scope</b>
          <button className="scope active">This Case Only</button>
          <button className="scope">All Cases</button>
        </div>
        <span>
          {activeCase
            ? `Isolated case container: ${activeCase.id}`
            : 'Cumulative operations archive'}
        </span>
      </div>
      <div className="metric-grid">
        <Metric label="Case Operations" icon={<Activity size={18} />} />
        <Metric label="Case Files Carved" icon={<FileSearch size={18} />} />
        <Metric label="Case Drives Sanitized" icon={<HardDrive size={18} />} />
        <Metric label="Case Files Shredded" icon={<FileArchive size={18} />} />
      </div>
      <Section
        eyebrow="PRIMARY FORENSIC WORKFLOWS"
        title="Operational modules"
        note="Frontend simulation"
      />
      <div className="workflow-grid">
        <Workflow
          icon={<FileSearch size={19} />}
          title="Evidence Deep Carving"
          text="Recover deleted artifacts through signature-based analysis of an evidence source."
          status="ISO/IEC 27037 • READ-ONLY"
          onClick={() => navigate('recovery')}
        />
        <Workflow
          icon={<HardDrive size={19} />}
          title="Certified Drive Sanitization"
          text="Plan a bounded media sanitization workflow with standards and verification choices."
          status="NIST SP 800-88 • SIMULATED"
          onClick={() => navigate('sanitizer')}
        />
        <Workflow
          icon={<FileArchive size={19} />}
          title="Targeted File Shredder"
          text="Review a four-step metadata cleansing pipeline for selected target files."
          status="BOUNDARY GUARD • DEMO"
          onClick={() => navigate('shredder')}
        />
      </div>
    </Layout>
  )
}
function Recovery() {
  const [started, setStarted] = useState(false)
  const [selected, setSelected] = useState(['PNG', 'JPEG', 'PDF'])
  return (
    <Layout
      eyebrow="EVIDENCE RECOVERY"
      title="Evidence Recovery"
      subtitle="Recover deleted files from raw sectors via signature-based deep carving."
      action={
        <button className="button secondary">
          <Plus size={14} /> Test Media
        </button>
      }
    >
      <Banner
        tone="green"
        title="Write-protected read-only access"
        text="Frontend simulation: no evidence source is connected and no data will be modified."
        tags={['ZERO-SPOILATION PREVIEW', 'READ-ONLY']}
      />
      <Panel
        title="Evidence write-blocker"
        icon={<ShieldCheck size={16} />}
        action={<Badge tone="gray">DEMO • NOT CONNECTED</Badge>}
      >
        <div className="blocker">
          <div>
            <b>ISO/IEC 27037 evidence write-blocker</b>
            <p>
              Simulated read-only control surface. No kernel or hardware access
              is active.
            </p>
          </div>
          <div className="button-row">
            <button className="button tiny secondary">READ ONLY</button>
            <button className="button tiny secondary">Verify Probe</button>
            <button className="button tiny secondary">Inspect</button>
          </div>
        </div>
      </Panel>
      <div className="two-col">
        <Panel
          title="Source device / disk image"
          icon={<HardDrive size={16} />}
        >
          <SelectRow
            label="Evidence source"
            value="No drive or disk image connected"
          />
          <button className="button secondary full">
            <Upload size={14} /> Browse .dd / .raw / .img
          </button>
          <SelectRow
            label="Recovery destination"
            value="Choose destination folder"
          />
        </Panel>
        <Panel title="Recovery mode" icon={<Zap size={16} />}>
          <Choice
            title="Turbo Fast Recovery"
            text="Rapid scan of common file signatures."
            selected
          />
          <Choice
            title="Deep Forensic Carve"
            text="Sector-by-sector scan across the evidence surface."
          />
        </Panel>
      </div>
      <Panel
        title="Target formats"
        icon={<FileSearch size={16} />}
        action={
          <div className="text-actions">
            <button onClick={() => setSelected(formats)}>All</button>
            <button onClick={() => setSelected([])}>None</button>
          </div>
        }
      >
        <div className="chips">
          {formats.map((format) => (
            <button
              key={format}
              className={selected.includes(format) ? 'chip selected' : 'chip'}
              onClick={() =>
                setSelected(
                  selected.includes(format)
                    ? selected.filter((item) => item !== format)
                    : [...selected, format],
                )
              }
            >
              {selected.includes(format) && <Check size={11} />}
              {format}
            </button>
          ))}
        </div>
      </Panel>
      <FooterAction
        text={
          started
            ? 'Recovery simulation queued. No files were read or written.'
            : 'Ready for frontend simulation.'
        }
        button={started ? 'Simulation Started' : 'Start Turbo Fast Recovery'}
        onClick={() => setStarted(true)}
      />
    </Layout>
  )
}
function Sanitizer() {
  const [dryRun, setDryRun] = useState(true)
  const [confirm, setConfirm] = useState(false)
  return (
    <Layout
      eyebrow="MEDIA SANITIZATION"
      title="Certified Storage Sanitizer"
      subtitle="Sector-level overwrite planning with partition isolation and verification."
      action={
        <>
          <button className="button secondary">
            <Plus size={14} /> Create Virtual Disk (Test)
          </button>
          <button className="button secondary">
            <RefreshCw size={14} /> Refresh Media
          </button>
        </>
      }
    >
      <Step number="01" title="Select target device / USB partition">
        <div className="device">
          <span className="device-icon">
            <HardDrive size={20} />
          </span>
          <div>
            <b>SanDisk Cruzer Blade</b>
            <small>USB PEN DRIVE • 32 GB • USB</small>
            <code>\\Device\\HarddiskVolume3</code>
          </div>
          <Badge tone="gray">DEMO DEVICE</Badge>
          <button className="button tiny secondary">Select Entire Drive</button>
        </div>
        <div className="partitions">
          <span>Detected partitions</span>
          <button className="partition selected">
            <b>Partition 1</b>
            <small>29.8 GB • FAT32</small>
          </button>
          <button className="partition">
            <b>Partition 2</b>
            <small>Reserved • 128 MB</small>
          </button>
        </div>
      </Step>
      <Banner
        tone="amber"
        title="Partition Boundary Lock Active"
        text="Sanitization is strictly confined to the selected partition in this simulation."
        tags={['STRICTLY BOUNDED', 'TARGET: PARTITION 1']}
      />
      <Step number="02" title="Choose sanitization standard & verification">
        <div className="choices">
          <Choice
            title="NIST SP 800-88 Fast Cryptographic Purge"
            text="Rapid media-level crypto erase preview."
            selected
          />
          <Choice
            title="NIST SP 800-88 Rev. 1 Clear"
            text="Single-pass logical overwrite preview."
          />
          <Choice
            title="NIST SP 800-88 Rev. 1 Purge"
            text="Enhanced purge workflow preview."
          />
          <Choice
            title="DoD 5220.22-M Legacy Standard"
            text="Legacy option, not a current requirement."
          />
        </div>
        <ToggleRow
          label="Dry Run Mode"
          text="Simulate without modifying disk"
          checked={dryRun}
          change={setDryRun}
        />
        <ToggleRow
          label="Post-wipe verification"
          text="Preview verification after simulated execution"
          checked
          change={() => undefined}
        />
      </Step>
      <div className="danger-panel">
        <div>
          <AlertTriangle size={18} />
          <span>
            <b>Start permanent sanitization</b>
            <small>IRREVERSIBLE ACTION • FRONTEND SIMULATION ONLY</small>
          </span>
        </div>
        <button className="button danger" onClick={() => setConfirm(true)}>
          Start permanent sanitization
        </button>
      </div>
      {confirm && (
        <Confirm
          title="Simulate permanent sanitization?"
          text="No device will be modified. This only previews the confirmation state."
          close={() => setConfirm(false)}
        />
      )}
    </Layout>
  )
}
function Shredder() {
  const [confirm, setConfirm] = useState(false)
  const steps = [
    ['01', 'Cluster Overwrite'],
    ['02', 'Slack Space Purge'],
    ['03', 'Filename Scramble'],
    ['04', 'Pointer Truncation'],
  ]
  return (
    <Layout
      eyebrow="TARGETED CLEANSING"
      title="4-Step File & Metadata Shredder"
      subtitle="Cluster overwrite, slack purge, filename scramble, and pointer truncation bounded to target files."
      action={
        <>
          <button className="button secondary">
            <FolderOpen size={14} /> Select Files
          </button>
          <button className="button secondary">
            <FolderOpen size={14} /> Select Folder
          </button>
        </>
      }
    >
      <Banner
        tone="amber"
        title="Detected pen drive partitions"
        text="Boundary Guard Active • Partition isolation is represented for this frontend preview."
        tags={['PARTITION 1', 'BOUNDARY GUARD']}
      />
      <Section
        eyebrow="METADATA CLEANSING PIPELINE"
        title="Four controlled steps"
      />
      <div className="pipeline">
        {steps.map(([number, title]) => (
          <div key={number}>
            <span>{number}</span>
            <b>{title}</b>
            <p>Bounded frontend preview of this stage.</p>
          </div>
        ))}
      </div>
      <Panel
        title="Selected targets for shredding (0)"
        icon={<FileArchive size={16} />}
      >
        <Empty
          title="No targets selected"
          text="Select files or a folder to preview the bounded shredding workflow."
          icon={<FolderOpen size={24} />}
        />
      </Panel>
      <div className="two-col">
        <Panel title="Standard" icon={<ShieldCheck size={16} />}>
          <Choice
            title="NIST Clear"
            text="Logical overwrite preview."
            selected
          />
          <Choice title="NIST Purge" text="Enhanced purge preview." />
        </Panel>
        <Panel title="Clean metadata" icon={<ClipboardCheck size={16} />}>
          <label className="check">
            <input type="checkbox" defaultChecked />
            <span>
              <b>Purge Windows Explorer traces</b>
              <small>MRU traces, JumpLists, and LNK shortcuts.</small>
            </span>
          </label>
        </Panel>
      </div>
      <FooterAction
        text="Ready for frontend simulation. No file or metadata will be deleted."
        button="Start file shredding"
        danger
        onClick={() => setConfirm(true)}
      />
      {confirm && (
        <Confirm
          title="Simulate file shredding?"
          text="No files, metadata, or storage sectors will be changed."
          close={() => setConfirm(false)}
        />
      )}
    </Layout>
  )
}
function Audit() {
  return (
    <Layout
      eyebrow="EVIDENCE INTEGRITY"
      title="Tamper-Evident Chained Audit Ledger"
      subtitle="Forward-integrity chain visualization for frontend demonstration data."
      action={
        <>
          <button className="button secondary">
            <ShieldCheck size={14} /> Verify Chain Integrity
          </button>
          <button className="button secondary">
            <Download size={14} /> Export Bundle
          </button>
        </>
      }
    >
      <Banner
        tone="gray"
        title="Cryptographic ledger is not connected"
        text="No audit records are fabricated. Real chain verification requires the backend service."
        tags={['SHA-256 PREVIEW', 'NOT VERIFIED']}
      />
      <div className="filters">
        <Search size={15} />
        <input placeholder="Search by Case ID, Operator, target hash..." />
        <select defaultValue="all">
          <option value="all">All cases</option>
        </select>
        <select defaultValue="all">
          <option value="all">All operations</option>
        </select>
        <button className="icon-button">
          <RefreshCw size={15} />
        </button>
      </div>
      <Panel title="Audit records" icon={<ClipboardCheck size={16} />}>
        <Empty
          title="No matching audit records found"
          text="The cryptographic ledger has no frontend demo entries for this workspace."
          icon={<ClipboardCheck size={24} />}
        />
      </Panel>
      <div className="ledger-footer">
        0 cryptographic blocks in ledger{' '}
        <span>Sovereign Ed25519 / awaiting backend verification</span>
      </div>
    </Layout>
  )
}
function Reports() {
  return (
    <Layout
      eyebrow="DOCUMENTATION"
      title="Forensic Reports & Compliance Certificates"
      subtitle="Prepare evidence documentation and certificate previews without claiming legal admissibility."
      action={
        <>
          <button className="button secondary">
            <Upload size={14} /> Import Bundle
          </button>
          <button className="button secondary">
            <Download size={14} /> Export Bundle
          </button>
        </>
      }
    >
      <div className="tabs">
        <button className="active">Certificates</button>
        <button>Generate Certificate</button>
        <button>Verify & Authenticate</button>
      </div>
      <Banner
        tone="gray"
        title="Air-gap & standalone verification"
        text="Certificates can contain self-contained verification material when a real audit service is connected."
        tags={['FRONTEND PREVIEW']}
      />
      <Panel title="Certificate list" icon={<FileText size={16} />}>
        <Empty
          title="No certificates available"
          text="Create a case and connect an audit service before generating documentation."
          icon={<FileText size={24} />}
        />
      </Panel>
      <Panel title="Audit verification" icon={<ShieldCheck size={16} />}>
        <div className="verify-row">
          <div>
            <b>Verify audit chain</b>
            <p>Run this action only when a signed audit bundle is available.</p>
          </div>
          <button className="button secondary" disabled>
            Verify Audit Chain
          </button>
        </div>
      </Panel>
    </Layout>
  )
}
function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <Header title={title} icon={icon} action={action} />
      {children}
    </section>
  )
}
function Header({
  title,
  icon,
  action,
}: {
  title: string
  icon: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="panel-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}
function Section({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string
  title: string
  note?: string
}) {
  return (
    <div className="section">
      <div>
        <span className="section-kicker">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {note && <span>{note}</span>}
    </div>
  )
}
function Metric({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <b>0</b>
        <small>No simulated operations</small>
      </div>
      <i>{icon}</i>
    </div>
  )
}
function Workflow({
  icon,
  title,
  text,
  status,
  onClick,
}: {
  icon: ReactNode
  title: string
  text: string
  status: string
  onClick: () => void
}) {
  return (
    <button className="workflow" onClick={onClick}>
      <i>{icon}</i>
      <b>
        {title}
        <ArrowRight size={15} />
      </b>
      <p>{text}</p>
      <small>{status}</small>
    </button>
  )
}
function Detail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="detail">
      <span>{label}</span>
      <b className={mono ? 'mono' : ''}>{value}</b>
    </div>
  )
}
function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
function Banner({
  tone,
  title,
  text,
  tags,
}: {
  tone: Tone
  title: string
  text: string
  tags: string[]
}) {
  return (
    <div className={`banner ${tone}`}>
      <Info size={17} />
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
      <span>{tags.join(' • ')}</span>
    </div>
  )
}
function Step({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="step">
      <div className="step-title">
        <b>{number}</b>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}
function SelectRow({ label, value }: { label: string; value: string }) {
  return (
    <label className="select-row">
      <span>{label}</span>
      <button>{value}</button>
    </label>
  )
}
function Choice({
  title,
  text,
  selected = false,
}: {
  title: string
  text: string
  selected?: boolean
}) {
  return (
    <button className={`choice ${selected ? 'selected' : ''}`}>
      <i>{selected && <span />}</i>
      <span>
        <b>{title}</b>
        <small>{text}</small>
      </span>
    </button>
  )
}
function ToggleRow({
  label,
  text,
  checked,
  change,
}: {
  label: string
  text: string
  checked: boolean
  change: (value: boolean) => void
}) {
  return (
    <div className="toggle-row">
      <span>
        <b>{label}</b>
        <small>{text}</small>
      </span>
      <button
        className={checked ? 'toggle checked' : 'toggle'}
        onClick={() => change(!checked)}
      >
        <i />
      </button>
    </div>
  )
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <div className="empty">
      <i>{icon}</i>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  )
}
function FooterAction({
  text,
  button,
  onClick,
  danger = false,
}: {
  text: string
  button: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <div className={`footer-action ${danger ? 'warning' : ''}`}>
      <span>{text}</span>
      <button
        className={danger ? 'button danger' : 'button primary'}
        onClick={onClick}
      >
        <Play size={14} />
        {button}
      </button>
    </div>
  )
}
function Confirm({
  title,
  text,
  close,
}: {
  title: string
  text: string
  close: () => void
}) {
  return (
    <div className="confirm-backdrop">
      <div className="confirm">
        <AlertTriangle size={20} />
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="button secondary" onClick={close}>
          Close preview
        </button>
      </div>
    </div>
  )
}
function RoomModal() {
  const { createRoom, cancelFlow } = useCase()
  const [name, setName] = useState('')
  useEscape(cancelFlow)
  return (
    <Modal
      title="Create operation room"
      subtitle="Set up a shared workspace for coordinated operators."
      close={cancelFlow}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) createRoom(name)
        }}
      >
        <Field
          label="Room name"
          value={name}
          onChange={setName}
          placeholder="e.g. Dehradun Operation Room"
          autoFocus
        />
        <Actions
          disabled={!name.trim()}
          cancel={cancelFlow}
          label="Create room"
        />
      </form>
    </Modal>
  )
}
function RoomCreatedModal() {
  const { room, continueToCase, cancelFlow } = useCase()
  const [copied, setCopied] = useState(false)
  useEscape(cancelFlow)
  if (!room) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.id)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal
      title="Room created"
      subtitle="The operation room is ready for case registration."
      close={cancelFlow}
    >
      <div className="created-room">
        <span>ROOM NAME</span>
        <b>{room.name}</b>
        <span>ROOM ID</span>
        <code>{room.id}</code>
      </div>
      <div className="modal-actions">
        <button className="button secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy room ID'}
        </button>
        <button className="button primary" onClick={continueToCase}>
          Continue <ArrowRight size={15} />
        </button>
      </div>
    </Modal>
  )
}
function CaseModal() {
  const { mode, room, createCase, cancelFlow } = useCase()
  const [name, setName] = useState('')
  const [evidenceName, setEvidenceName] = useState('')
  const [description, setDescription] = useState('')
  useEscape(cancelFlow)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && evidenceName.trim())
      createCase({
        name: name.trim(),
        evidenceName: evidenceName.trim(),
        description: description.trim(),
      })
  }
  return (
    <Modal
      title="Create case"
      subtitle="Register the evidence workspace before operations begin."
      close={cancelFlow}
    >
      <div className="modal-context">
        <span>
          MODE <b>{mode}</b>
        </span>
        {room && (
          <span>
            ROOM <b>{room.id}</b>
          </span>
        )}
      </div>
      <form onSubmit={submit}>
        <div className="field-row">
          <Field
            label="Case name"
            value={name}
            onChange={setName}
            placeholder="e.g. External media triage"
            autoFocus
          />
          <Field
            label="Evidence / device name"
            value={evidenceName}
            onChange={setEvidenceName}
            placeholder="e.g. Seized USB media"
          />
        </div>
        <label className="field">
          <span>
            Description <em>OPTIONAL</em>
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Describe the scope of this case"
          />
        </label>
        <Actions
          disabled={!name.trim() || !evidenceName.trim()}
          cancel={cancelFlow}
          label="Create case"
        />
      </form>
    </Modal>
  )
}
function Modal({
  title,
  subtitle,
  close,
  children,
}: {
  title: string
  subtitle: string
  close: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <span className="eyebrow">SECURE WORKFLOW</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}
function Actions({
  disabled,
  cancel,
  label,
}: {
  disabled: boolean
  cancel: () => void
  label: string
}) {
  return (
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={cancel}>
        Cancel
      </button>
      <button className="button primary" disabled={disabled}>
        {label} <ArrowRight size={15} />
      </button>
    </div>
  )
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoFocus?: boolean
}) {
  return (
    <label className="field">
      <span>
        {label} <em>REQUIRED</em>
      </span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
function useEscape(close: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])
}
function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
export default App
