# CyberSanitize Hackathon Submission

## 1. Executive Summary

CyberSanitize is an Electron-based Windows platform for secure storage sanitization and digital evidence handling. It combines local disk operations, forensic recovery, multi-device orchestration, write-blocking safeguards, signed audit records, and certificate verification in one desktop workflow.

The central idea is operational trust: every action has a selected target, an operator/case context, live progress, completion status, and a verifiable record.

## 2. Problem

Organizations often handle storage media across several workstations while needing to answer four questions:

1. What exact device or partition was handled?
2. Which operator and case authorized the action?
3. Did the operation actually complete and verify?
4. Can another person independently check the resulting record?

CyberSanitize addresses these questions without requiring an internet connection for core operations.

## 3. Solution Highlights

### Secure sanitization

- Internal disks, partitions, removable media, and test images can be inventoried.
- Wipe engines stream progress and verification data.
- Target guards, write-blocker checks, operation locks, and administrator controls reduce accidental targeting.

### Forensic recovery

- Signature-based carving recovers supported deleted file types from selected evidence sources.
- Recovered files include metadata such as type, offset, size, confidence, output path, and hash information.
- Multi-device recovery transfers recovered file data back to the destination selected on the central laptop.

### Fleet orchestration

- A host creates a local room with an ephemeral key.
- Secondary laptops discover the host over LAN UDP discovery and connect through WebSocket.
- The host receives each node's internal and external drive inventory.
- A central operator selects a remote target and dispatches pre-scan, sanitization, or recovery.
- Telemetry and completion results are streamed back to the central dashboard.

### Evidence and verification

- Audit entries are persisted in a hash-chained ledger.
- Report/certificate data is signed with Ed25519.
- QR URLs expose a LAN verification authority for a phone on the same network.
- Air-gap payloads allow offline verification without contacting the host.

## 4. Architecture

```text
React Renderer
    |
    | contextBridge IPC
    v
Electron Preload
    |
    | typed IPC handlers
    v
Electron Main Process
    |-- Drive, wipe, recovery, audit, report, write-blocker services
    |-- FleetHost: WebSocket coordinator + UDP discovery responder
    |-- FleetClient: remote executor + telemetry producer
    |-- SQLite/audit persistence
    `-- Local verification HTTP authority :3847
```

### Fleet command lifecycle

```text
Central UI
  -> Fleet IPC
  -> FleetHost
  -> WebSocket command
  -> FleetClient on remote laptop
  -> Local engine
  -> TELEMETRY / JOB_COMPLETE
  -> FleetHost
  -> Central renderer
```

## 5. Technology Stack

- Electron 34
- React 18
- TypeScript 5
- Vite through electron-vite
- WebSocket through `ws`
- SQLite through `better-sqlite3`
- `pdf-lib` for certificate/report generation
- `tweetnacl` for Ed25519 signatures
- Vitest for automated tests
- electron-builder with NSIS for Windows installers

## 6. Local Development

### Prerequisites

- Windows 10/11 x64
- Node.js 20+
- npm 10+
- Administrator terminal for physical media features

### Setup

```powershell
git clone https://github.com/sitanshukumar173/cybersanitize-syntax_debuggers-122.git
Set-Location cybersanitize-syntax_debuggers-122
npm install
```

### Development commands

```powershell
npm run dev          # Start Electron with Vite development mode
npm run typecheck    # TypeScript validation
npm test             # Vitest suite
npm run build        # Production bundle validation
```

### Fleet smoke checks

```powershell
node scratch/test-fleet-workspace-join.cjs
node scratch/test-fleet-e2e.mjs
```

## 7. Build and Installation

### Local unpacked build

```powershell
npm run build:dir
```

Use the generated executable in `dist/win-unpacked/` for a local packaged run.

### Windows installer

```powershell
npm run build:win
```

The generated NSIS installer is placed in `dist/`. Run the installer, choose an installation directory, and launch **CyberSanitize** from the Start Menu or desktop shortcut. Administrator permission is expected for physical storage operations.

### GitHub release

The workflow in `.github/workflows/release.yml` builds and publishes the installer when a version tag is pushed:

```powershell
git add .
git commit -m "Prepare hackathon release"
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

Download links:

- Website placeholder: [Add final website URL](https://YOUR-DOWNLOAD-WEBSITE.example/download)
- GitHub Releases: [Download the latest installer](https://github.com/sitanshukumar173/cybersanitize-syntax_debuggers-122/releases)

## 8. Judge Demonstration Flow

### Single-device demo

1. Launch as administrator.
2. Open Single Device.
3. Refresh media inventory.
4. Select a disposable test image or test drive.
5. Run a pre-check and start sanitization.
6. Show live progress, heatmap, verification, audit entry, and report.
7. Open Recovery with a test evidence image and show recovered-file metadata.

### Multi-device demo

1. Launch the central laptop and create a fleet workspace.
2. Share the generated room key.
3. Launch the application on a second laptop on the same LAN.
4. Join the workspace using the room key.
5. On the central laptop, open the joined node.
6. Show its internal and external drives.
7. Select a disposable target and run pre-scan, recovery, or sanitization.
8. Show remote telemetry, completion status, audit records, and recovered files saved to the central destination.

### QR verification demo

1. Generate a signed report.
2. Open the report QR modal or scan the certificate QR.
3. Connect the phone to the same LAN as the host laptop.
4. Ensure Windows Firewall permits inbound TCP `3847`.
5. Show the independent verification result on the phone.
6. For an offline demonstration, use the air-gap QR payload in Reports.

## 9. Safety and Limitations

- Wipe and file-erasure operations are destructive.
- A disposable test image or drive must be used for demonstrations.
- Fleet discovery requires a reachable LAN and may require firewall configuration.
- Phone QR verification is LAN-based; it is not a public cloud verification service.
- The download website URL is intentionally a placeholder until the final hosting location is selected.

## 10. Submission Checklist

- [ ] Replace the website placeholder URL in `readme.md` and this document.
- [ ] Push the final repository to GitHub.
- [ ] Create a version tag and verify the GitHub Actions release.
- [ ] Download and test the generated Windows installer on a clean Windows machine.
- [ ] Add screenshots or a short demo video to the repository.
- [ ] Add the final license and team details.
- [ ] Confirm the final QR verification host IP and firewall rule on the demo network.
