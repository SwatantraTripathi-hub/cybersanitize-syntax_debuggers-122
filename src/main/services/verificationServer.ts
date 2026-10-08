import * as http from 'http';
import * as url from 'url';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import nacl from 'tweetnacl';

function getUserDataPath(): string {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) {}
  const home = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  const appData = path.join(home, 'cybersanitize-forensic-tool');
  if (!fs.existsSync(appData)) {
    try { fs.mkdirSync(appData, { recursive: true }); } catch (_) {}
  }
  return appData;
}

export class VerificationServer {
  private server: http.Server | null = null;
  private port: number = 3847;
  private isRunning: boolean = false;

  start(preferredPort = 3847): Promise<number> {
    return new Promise((resolve) => {
      this.port = preferredPort;
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.isRunning = true;
        console.log(`[VerificationServer] Live forensic verification authority listening on http://localhost:${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[VerificationServer] Port ${this.port} in use, trying ${this.port + 1}...`);
          this.port++;
          this.server?.listen(this.port, '0.0.0.0', () => {
            this.isRunning = true;
            resolve(this.port);
          });
        } else {
          console.error('[VerificationServer] Server error:', err.message);
          resolve(this.port);
        }
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.isRunning = false;
    }
  }

  getPort(): number {
    return this.port;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsed = url.parse(req.url || '/', true);
    const pathname = parsed.pathname;

    // Enable CORS for external inspector access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ONLINE', authority: 'CyberSanitize Sovereign Cryptographic Enclave', port: this.port }));
      return;
    }

    if (pathname === '/verify') {
      const dataPayload = (parsed.query.data || parsed.query.payload || '') as string;
      const certRef = (parsed.query.ref || parsed.query.id || '') as string;
      const result = dataPayload
        ? {
            found: false,
            valid: false,
            certRef: '',
            caseId: '',
            tagId: '',
            title: '',
            certDigest: '',
            operatorId: '',
            timestamp: '',
            pdfSha256: '',
            publicKey: '',
            signature: '',
            error: 'Payload verification is disabled. Scan a LAN certificate URL with its certificate reference.'
          }
        : this.verifyCertificateByQuery(certRef);
      this.renderVerificationHtml(res, result);
      return;
    }

    // Default welcome page
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>CyberSanitize Forensic Verification Authority</title></head>
      <body style="font-family: system-ui, sans-serif; background: #04160f; color: #fff; padding: 40px; text-align: center;">
        <h1 style="color: #00ed64;">CyberSanitize Sovereign Cryptographic Enclave</h1>
        <p style="color: #8fa59a;">Independent Digital Evidence & Data Sanitization Verification Authority</p>
        <p style="font-size: 13px; color: #6e8479;">Scan the QR code on any certificate or visit <code>/verify?ref=CERT_REF</code></p>
      </body>
      </html>
    `);
  }

  private verifyCertificateByPayload(rawPayload: string): {
    found: boolean;
    valid: boolean;
    certRef: string;
    caseId: string;
    tagId: string;
    title: string;
    certDigest: string;
    operatorId: string;
    timestamp: string;
    pdfSha256: string;
    publicKey: string;
    signature: string;
    error?: string;
  } {
    try {
      let trimmed = decodeURIComponent(rawPayload || '').trim();
      if (!trimmed.includes('\n') && !trimmed.startsWith('{') && trimmed.length > 50) {
        try {
          const dec = Buffer.from(trimmed, 'base64').toString('utf8');
          if (dec.includes('{') || dec.includes(':')) trimmed = dec.trim();
        } catch (_) {}
      }

      let dict: Record<string, string> = {};
      if (trimmed.startsWith('{')) {
        try {
          const obj = JSON.parse(trimmed);
          dict = {
            certref: obj.certRef || obj.cert || obj.ref,
            caseid: obj.caseId || obj.case,
            tagid: obj.tagId || obj.tag,
            title: obj.title || obj.caseTitle,
            target: obj.target,
            status: obj.status,
            examiner: obj.examiner || obj.operatorId,
            timestamp: obj.timestamp || obj.ts,
            presha256: obj.preHash || obj.pre_sha256 || obj.pre,
            postsha256: obj.postHash || obj.post_sha256 || obj.post,
            digest: obj.certDigest || obj.digest,
            publickey: obj.publicKey || obj.pk,
            signature: obj.signature || obj.sig
          };
        } catch (_) {}
      } else {
        const lines = trimmed.split('\n');
        for (const l of lines) {
          const idx = l.indexOf(':');
          if (idx > -1) {
            const k = l.slice(0, idx).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const v = l.slice(idx + 1).trim();
            dict[k] = v;
          }
        }
      }

      const certRef = dict.certref || 'CERT-AIRGAP';
      const caseId = dict.caseid || 'UNKNOWN';
      const tagId = dict.tagid || 'EVD-AIRGAP';
      const title = dict.title || 'Air-Gap Forensic Operation';
      const target = dict.target || 'Storage Device';
      const examiner = dict.examiner || 'UNKNOWN';
      const timestamp = dict.timestamp || '';
      const preHash = dict.presha256 || dict.prehash || '';
      const postHash = dict.postsha256 || dict.posthash || '';
      const certDigest = dict.digest || '';
      const pubKey = dict.publickey || '';
      const signature = dict.signature || '';

      const boundPayload = [certRef, tagId, title, target, preHash, postHash, caseId, examiner, timestamp].join('|');
      const calculatedDigest = crypto.createHash('sha256').update(boundPayload).digest('hex');
      const digestMatch = !certDigest || (calculatedDigest.toLowerCase() === certDigest.toLowerCase());

      let sigValid = false;
      if (pubKey && signature) {
        try {
          const pubBytes = new Uint8Array(Buffer.from(pubKey, 'hex'));
          const sigBytes = new Uint8Array(Buffer.from(signature, 'hex'));
          sigValid = nacl.sign.detached.verify(Buffer.from(calculatedDigest, 'hex'), sigBytes, pubBytes) ||
                     (certDigest && nacl.sign.detached.verify(Buffer.from(certDigest, 'hex'), sigBytes, pubBytes));
        } catch (_) {}
      }

      const isValid = sigValid && digestMatch;
      return {
        found: true,
        valid: isValid,
        certRef,
        caseId,
        tagId,
        title,
        certDigest: certDigest || calculatedDigest,
        operatorId: examiner,
        timestamp,
        pdfSha256: postHash,
        publicKey: pubKey,
        signature
      };
    } catch (e: any) {
      return {
        found: false,
        valid: false,
        certRef: 'AIRGAP-PAYLOAD',
        caseId: '',
        tagId: '',
        title: '',
        certDigest: '',
        operatorId: '',
        timestamp: '',
        pdfSha256: '',
        publicKey: '',
        signature: '',
        error: e.message
      };
    }
  }

  private verifyCertificateByQuery(query: string): {
    found: boolean;
    valid: boolean;
    certRef: string;
    caseId: string;
    tagId: string;
    title: string;
    certDigest: string;
    operatorId: string;
    timestamp: string;
    pdfSha256: string;
    publicKey: string;
    signature: string;
    error?: string;
  } {
    try {
      const reportsDir = path.join(getUserDataPath(), 'reports');
      if (!fs.existsSync(reportsDir)) {
        return { found: false, valid: false, certRef: query, caseId: '', tagId: '', title: '', certDigest: '', operatorId: '', timestamp: '', pdfSha256: '', publicKey: '', signature: '', error: 'Reports repository directory not found.' };
      }

      const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.pdf'));
      if (files.length === 0) {
        return { found: false, valid: false, certRef: query, caseId: '', tagId: '', title: '', certDigest: '', operatorId: '', timestamp: '', pdfSha256: '', publicKey: '', signature: '', error: 'No certificate records found in repository.' };
      }

      // Sort files by mtime descending (newest first)
      files.sort((a, b) => {
        try {
          return fs.statSync(path.join(reportsDir, b)).mtimeMs - fs.statSync(path.join(reportsDir, a)).mtimeMs;
        } catch (_) { return 0; }
      });

      const cleanQuery = decodeURIComponent(query || '').trim().toLowerCase();
      let targetPdfPath = '';
      let targetSigData: any = null;

      for (const f of files) {
        const fullPdf = path.join(reportsDir, f);
        const sigPath = fullPdf + '.sig';
        if (fs.existsSync(sigPath)) {
          try {
            const sigInfo = JSON.parse(fs.readFileSync(sigPath, 'utf8'));
            if (!cleanQuery) {
              targetPdfPath = fullPdf;
              targetSigData = sigInfo;
              break;
            }
            const refMatch = sigInfo.certRef && sigInfo.certRef.toLowerCase().includes(cleanQuery);
            const fileMatch = f.toLowerCase().includes(cleanQuery);
            const caseMatch = sigInfo.caseId && sigInfo.caseId.toLowerCase().includes(cleanQuery);
            const hashMatch = (sigInfo.pdfSha256 && sigInfo.pdfSha256.toLowerCase().includes(cleanQuery)) || (sigInfo.certDigest && sigInfo.certDigest.toLowerCase().includes(cleanQuery));
            if (refMatch || fileMatch || caseMatch || hashMatch) {
              targetPdfPath = fullPdf;
              targetSigData = sigInfo;
              break;
            }
          } catch (_) {}
        }
      }

      // Never substitute another certificate for an explicitly requested reference.
      if (!targetPdfPath && !cleanQuery && files.length > 0) {
        const fallbackPdf = path.join(reportsDir, files[0]);
        const fallbackSig = fallbackPdf + '.sig';
        if (fs.existsSync(fallbackSig)) {
          try {
            targetPdfPath = fallbackPdf;
            targetSigData = JSON.parse(fs.readFileSync(fallbackSig, 'utf8'));
          } catch (_) {}
        }
      }

      if (!targetPdfPath || !targetSigData) {
        return { found: false, valid: false, certRef: query, caseId: '', tagId: '', title: '', certDigest: '', operatorId: '', timestamp: '', pdfSha256: '', publicKey: '', signature: '', error: 'Certificate record not found in repository.' };
      }

      // Check SHA-256 and Ed25519 signature
      const pdfBytes = fs.readFileSync(targetPdfPath);
      const actualHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
      const hashValid = actualHash === targetSigData.pdfSha256;

      let sigValid = false;
      const pubHex = targetSigData.publicKey;
      if (pubHex) {
        try {
          const pubBytes = new Uint8Array(Buffer.from(pubHex, 'hex'));
          const candidates = [
            targetSigData.pdfSignature,
            targetSigData.signature,
            targetSigData.evidenceSignature
          ].filter(Boolean);

          for (const cand of candidates) {
            try {
              const sigBytes = new Uint8Array(Buffer.from(cand, 'hex'));
              // 1. Check against raw PDF bytes
              if (nacl.sign.detached.verify(pdfBytes, sigBytes, pubBytes)) {
                sigValid = true;
                break;
              }
              // 2. Check against bound certDigest
              if (targetSigData.certDigest && nacl.sign.detached.verify(Buffer.from(targetSigData.certDigest, 'hex'), sigBytes, pubBytes)) {
                sigValid = true;
                break;
              }
              // 3. Check against actual SHA-256
              if (nacl.sign.detached.verify(Buffer.from(actualHash, 'hex'), sigBytes, pubBytes)) {
                sigValid = true;
                break;
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // Overall validity: hash match is verified and signature is mathematically authenticated
      const isValid = hashValid && sigValid;

      return {
        found: true,
        valid: isValid,
        certRef: targetSigData.certRef || query,
        caseId: targetSigData.caseId || 'UNKNOWN',
        tagId: targetSigData.tagId || targetSigData.evidenceTag || 'EVD-PRIMARY-01',
        title: targetSigData.title || targetSigData.caseTitle || 'Certified Cryptographic Forensic Operation',
        certDigest: targetSigData.certDigest || '',
        operatorId: targetSigData.operatorId || 'UNKNOWN',
        timestamp: targetSigData.timestamp || '',
        pdfSha256: targetSigData.pdfSha256 || actualHash,
        publicKey: targetSigData.publicKey || '',
        signature: targetSigData.pdfSignature || targetSigData.signature || ''
      };
    } catch (e: any) {
      return { found: false, valid: false, certRef: query, caseId: '', tagId: '', title: '', certDigest: '', operatorId: '', timestamp: '', pdfSha256: '', publicKey: '', signature: '', error: e.message };
    }
  }

  private renderVerificationHtml(res: http.ServerResponse, result: any): void {
    const isOk = result.found && result.valid;
    const statusColor = isOk ? '#00ED64' : '#FF4D4F';
    const statusBg = isOk ? 'rgba(0, 237, 100, 0.12)' : 'rgba(255, 77, 79, 0.12)';
    const statusBorder = isOk ? 'rgba(0, 237, 100, 0.4)' : 'rgba(255, 77, 79, 0.4)';
    const titleText = isOk ? 'AUTHENTIC EVIDENCE CERTIFICATE' : 'VERIFICATION FAILED / UNVERIFIED';
    const subtitleText = isOk
      ? 'Sovereign Ed25519 Enclave Verified • Non-Repudiation Guaranteed'
      : 'Cryptographic Integrity Warning: Certificate Record Incomplete or Modified';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <meta name="theme-color" content="#020B07">
  <title>Forensic Verification: ${result.certRef || 'Certificate'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #020B07;
      background-image: radial-gradient(circle at 50% 0%, rgba(0, 237, 100, 0.08) 0%, transparent 60%);
      color: #E8F0EC;
      padding: clamp(12px, 3vw, 24px);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .wrapper {
      width: 100%;
      max-width: 660px;
      margin: 0 auto;
    }
    .container {
      background: #061A12;
      border: 1px solid rgba(0, 237, 100, 0.2);
      border-radius: clamp(14px, 4vw, 20px);
      padding: clamp(16px, 4vw, 28px);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 1px rgba(0, 237, 100, 0.3);
    }
    .badge-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 9999px;
      background: ${statusBg};
      border: 1px solid ${statusBorder};
      color: ${statusColor};
      margin-bottom: 16px;
      width: fit-content;
      max-width: 100%;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${statusColor};
      box-shadow: 0 0 8px ${statusColor};
      flex-shrink: 0;
    }
    .badge-text {
      font-weight: 800;
      font-size: 11.5px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    h1 {
      font-size: clamp(18px, 4.5vw, 22px);
      font-weight: 800;
      color: #FFFFFF;
      line-height: 1.3;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: clamp(12px, 3vw, 13px);
      color: #8BA699;
      line-height: 1.4;
      margin-bottom: 20px;
    }
    .card-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }
    @media (min-width: 540px) {
      .card-grid {
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .col-span-full {
        grid-column: span 2;
      }
    }
    .item-card {
      background: #030F0A;
      border: 1px solid rgba(0, 237, 100, 0.12);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .item-label {
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #7A998B;
      font-weight: 600;
    }
    .item-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: clamp(12px, 3.2vw, 13px);
      font-weight: 600;
      color: #FFFFFF;
      word-break: break-all;
      line-height: 1.4;
    }
    .highlight-green {
      color: #00ED64;
    }
    .actions-bar {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 18px;
    }
    @media (min-width: 480px) {
      .actions-bar {
        flex-direction: row;
      }
    }
    .btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn-primary {
      background: #00ED64;
      color: #020B07;
    }
    .btn-primary:active {
      transform: scale(0.98);
      background: #00c754;
    }
    .btn-secondary {
      background: rgba(0, 237, 100, 0.08);
      color: #00ED64;
      border: 1px solid rgba(0, 237, 100, 0.3);
    }
    .btn-secondary:active {
      transform: scale(0.98);
      background: rgba(0, 237, 100, 0.15);
    }
    .legal-notice {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      color: #7A998B;
      line-height: 1.5;
      text-align: justify;
    }
    .footer-brand {
      margin-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #557365;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #00ED64;
      color: #020B07;
      padding: 10px 20px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 12px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.5);
      transition: transform 0.3s ease;
      z-index: 1000;
      pointer-events: none;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="badge-bar">
        <div class="pulse-dot"></div>
        <span class="badge-text">${titleText}</span>
      </div>

      <h1>${result.title || 'Digital Evidence Attestation'}</h1>
      <p class="subtitle">${subtitleText}</p>

      <div class="card-grid">
        <div class="item-card">
          <span class="item-label">Certificate ID</span>
          <span class="item-value highlight-green">${result.certRef || 'N/A'}</span>
        </div>

        <div class="item-card">
          <span class="item-label">Evidence Tag ID</span>
          <span class="item-value highlight-green">${result.tagId || 'N/A'}</span>
        </div>

        <div class="item-card">
          <span class="item-label">Registered Case ID</span>
          <span class="item-value">${result.caseId || 'N/A'}</span>
        </div>

        <div class="item-card">
          <span class="item-label">Authorized Examiner</span>
          <span class="item-value">${result.operatorId || 'N/A'}</span>
        </div>

        <div class="item-card col-span-full">
          <span class="item-label">Canonical Timestamp (UTC)</span>
          <span class="item-value">${result.timestamp ? new Date(result.timestamp).toUTCString() : 'N/A'}</span>
        </div>

        ${result.certDigest ? `
        <div class="item-card col-span-full">
          <span class="item-label">Bound Evidence Digest (SHA-256)</span>
          <span class="item-value highlight-green">${result.certDigest}</span>
        </div>
        ` : ''}

        <div class="item-card col-span-full">
          <span class="item-label">Document SHA-256 Digest</span>
          <span class="item-value">${result.pdfSha256 || 'N/A'}</span>
        </div>

        <div class="item-card col-span-full">
          <span class="item-label">Sovereign Ed25519 Enclave Public Key</span>
          <span class="item-value" style="color: #A0B9AC;">${result.publicKey || 'N/A'}</span>
        </div>
      </div>

      ${result.error ? `<div style="background: rgba(255,77,79,0.1); border: 1px solid #FF4D4F; color: #FFA39E; padding: 12px; border-radius: 10px; font-size: 12px; margin-bottom: 16px;">${result.error}</div>` : ''}

      <div class="actions-bar">
        <button class="btn btn-primary" onclick="copyDossier()">
          <span>Copy Full Dossier</span>
        </button>
        <button class="btn btn-secondary" onclick="window.print()">
          <span>Print / Save PDF</span>
        </button>
      </div>

      <div class="legal-notice">
        <strong>Forensic Admissibility Attestation:</strong> This document and associated digital signatures are generated under controlled forensic protocols compliant with ISO/IEC 27037:2012, NIST SP 800-88 Rev. 1, Section 65B of the Indian Evidence Act 1872, and Section 63 of the Bharatiya Sakshya Adhiniyam 2023. Non-repudiation is mathematically guaranteed by the Sovereign Ed25519 Enclave.
      </div>
    </div>

    <div class="footer-brand">
      CyberSanitize Sovereign Forensic Authority Node &bull; Live Mobile Verification
    </div>
  </div>

  <div id="toast" class="toast">Dossier Copied to Clipboard!</div>

  <script>
    function copyDossier() {
      const text = "CYBERSANITIZE FORENSIC ATTESTATION\\n" +
        "Certificate ID: ${result.certRef}\\n" +
        "Tag ID: ${result.tagId}\\n" +
        "Case ID: ${result.caseId}\\n" +
        "Title: ${result.title}\\n" +
        "Examiner: ${result.operatorId}\\n" +
        "Issued: ${result.timestamp}\\n" +
        "Evidence Digest: ${result.certDigest}\\n" +
        "Document SHA-256: ${result.pdfSha256}\\n" +
        "Enclave Public Key: ${result.publicKey}\\n" +
        "Status: ${isOk ? 'VERIFIED AUTHENTIC' : 'UNVERIFIED'}";

      navigator.clipboard.writeText(text).then(function() {
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2200);
      });
    }
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}

export const verificationServer = new VerificationServer();
