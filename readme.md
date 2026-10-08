# CyberSanitize

CyberSanitize is a Windows desktop application for evidence-aware storage sanitization, forensic recovery, fleet orchestration, cryptographic audit logging, and QR-based certificate verification.

It is designed for controlled enterprise media handling where every operation needs a clear target, operator context, progress trail, and tamper-evident record.

## Hackathon Links

- Project website and installer download: **[Live download website - link to be added](https://YOUR-DOWNLOAD-WEBSITE.example/download)**
- GitHub repository: [github.com/sitanshukumar173/cybersanitize-syntax_debuggers-122](https://github.com/sitanshukumar173/cybersanitize-syntax_debuggers-122)
- GitHub releases and Windows installer downloads: [Open Releases](https://github.com/sitanshukumar173/cybersanitize-syntax_debuggers-122/releases)
- Full submission documentation: [docs/documentation.md](docs/documentation.md)

## What It Does

### Single-device operations

- Detects internal disks, partitions, removable media, and mounted volumes.
- Performs controlled NIST-style wipe operations with progress and verification telemetry.
- Recovers deleted files through signature-based carving.
- Generates signed audit and compliance reports.
- Provides write-blocker and target validation safeguards.

### Multi-device fleet operations

- Creates a local workspace with a room key.
- Discovers and authenticates joining laptops over the local network.
- Reports each laptop's internal and external storage targets.
- Lets the central laptop select a remote drive or partition.
- Dispatches pre-scan, sanitization, and recovery commands to selected laptops.
- Streams remote progress, completion status, recovered files, and audit events back to the central laptop.

### Verification and audit

- Maintains a hash-chained audit ledger.
- Signs certificate data with Ed25519 keys.
- Provides QR-based LAN verification for phones on the same network.
- Provides an air-gap verification payload for offline review.

## Requirements

- Windows 10 or Windows 11, x64
- Node.js 20 or newer
- npm 10 or newer
- Administrator privileges for physical disk operations
- A local Wi-Fi or Ethernet network for fleet mode

Physical sanitization is destructive. Use disposable test media while evaluating the application.

## Clone and Install

```powershell
git clone https://github.com/sitanshukumar173/cybersanitize-syntax_debuggers-122.git
Set-Location cybersanitize-syntax_debuggers-122
npm install
```

`npm install` also rebuilds the native `better-sqlite3` dependency for Electron through the repository's `postinstall` script.

## Run in Development Mode

```powershell
npm run dev
```

The Electron development window opens with hot reload enabled. The local verification authority starts on port `3847`.

Useful development checks:

```powershell
npm run typecheck
npm test
npm run build
```

Fleet protocol smoke tests:

```powershell
node scratch/test-fleet-workspace-join.cjs
node scratch/test-fleet-e2e.mjs
```

## Build the Windows Application

### Unpacked application directory

```powershell
npm run build:dir
```

This creates an unpacked Windows application in `dist/` for local inspection.

### Windows installer and executable

```powershell
npm run build:win
```

The NSIS installer is written to `dist/`. The configured product name is `CyberSanitize`, with a desktop shortcut and Start Menu shortcut. The installer allows the user to choose an installation directory and requests administrator privileges because physical storage operations require them.

To run the packaged application after a directory build, open the generated `CyberSanitize.exe` inside the unpacked output directory. To install it normally, run the generated NSIS `.exe` installer from `dist/`.

## GitHub Release Workflow

The repository includes `.github/workflows/release.yml`. To publish a Windows installer:

```powershell
git add .
git commit -m "Prepare hackathon release"
git push origin main

git tag v1.0.0
git push origin v1.0.0
```

Pushing a `v*` tag builds the Windows installer on GitHub Actions and attaches the generated `.exe` to a GitHub Release. The GitHub release URL is the recommended download link for judges until the public download website is available.

## Judge Quick Start

1. Download and install the Windows `.exe` from the project website or GitHub Releases.
2. Launch CyberSanitize as administrator.
3. Choose **Single Device** to inspect one workstation, or **Multi-Device Fleet** to coordinate multiple laptops.
4. For fleet mode, create a workspace on the central laptop and share the room key.
5. Join from secondary laptops on the same LAN.
6. Select a reported internal or external target before starting an operation.
7. Review live progress, completion status, audit records, and generated reports.
8. Scan a certificate QR code from a phone connected to the same LAN, or use the air-gap payload for offline verification.

## Repository Layout

```text
src/main/          Electron main process, engines, services, persistence, fleet host/client
src/preload/       Secure context-bridge API
src/renderer/      React interface and orchestration screens
tests/             Vitest unit and integration tests
scratch/           Fleet protocol smoke tests
docs/              Hackathon submission and operational documentation
```

## Safety Notes

- Disk wiping and file erasure are destructive and cannot be undone.
- Always confirm the selected physical disk, partition, or file target.
- Use a disposable test image or test drive before a live demonstration.
- Fleet operations require all laptops to be on the same reachable LAN.
- Phone QR verification requires the phone to reach the host laptop's LAN IP and TCP port `3847`; Windows Firewall may need an inbound rule.
- Recovery output is written to the destination selected in the central application after remote files are transferred back.

## License

This repository is supplied for the CyberSanitize hackathon submission. Add the final project license here before public distribution.
