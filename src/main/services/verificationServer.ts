import * as http from 'node:http';
import * as url from 'node:url';
import { ReportService } from './reportService';
import { ServiceContext } from './serviceContext';

export class VerificationServer {
  private static instance: VerificationServer | null = null;
  private server: http.Server | null = null;
  private port = 3847;
  private readonly reportService: ReportService;

  constructor(context: ServiceContext = ServiceContext.getInstance()) {
    this.reportService = new ReportService(context);
  }

  public static getInstance(): VerificationServer {
    if (!VerificationServer.instance) {
      VerificationServer.instance = new VerificationServer();
    }
    return VerificationServer.instance;
  }

  public start(preferredPort = 3847): Promise<number> {
    return new Promise((resolve) => {
      this.port = preferredPort;
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        resolve(this.port);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          this.port++;
          this.server?.listen(this.port, '0.0.0.0', () => {
            resolve(this.port);
          });
        } else {
          resolve(this.port);
        }
      });
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  public getPort(): number {
    return this.port;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsed = url.parse(req.url || '/', true);
    const pathname = parsed.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ONLINE',
          authority: 'CyberSanitize Sovereign Cryptographic Enclave',
          port: this.port
        })
      );
      return;
    }

    if (pathname === '/verify') {
      const payload = (parsed.query.data || parsed.query.payload || '') as string;
      const certRef = (parsed.query.ref || parsed.query.id || '') as string;

      let result: any;
      if (payload) {
        result = this.reportService.verifyAirGapPayload(payload);
      } else {
        result = this.verifyCertificateByQuery(certRef);
      }

      this.renderVerificationHtml(res, result);
      return;
    }

    if (pathname === '/api/verify') {
      const payload = (parsed.query.data || parsed.query.payload || '') as string;
      const certRef = (parsed.query.ref || parsed.query.id || '') as string;

      let result: any;
      if (payload) {
        result = this.reportService.verifyAirGapPayload(payload);
      } else {
        result = this.verifyCertificateByQuery(certRef);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private verifyCertificateByQuery(certRef: string): any {
    if (!certRef) {
      return { isValid: false, errors: ['No certificate reference specified'] };
    }

    const reports = this.reportService.listReports();
    const match = reports.find(
      (r) =>
        r.certRef?.toLowerCase() === certRef.toLowerCase() ||
        r.id.toLowerCase().includes(certRef.toLowerCase())
    );

    if (!match) {
      return {
        isValid: false,
        certRef,
        errors: [`Certificate "${certRef}" not found on local verification authority node`]
      };
    }

    const check = this.reportService.verifyCertificateFile(match.path, `${match.path}.sig`);
    return {
      isValid: check.isValid,
      signatureValid: check.signatureValid,
      digestValid: check.hashValid,
      certRef: match.certRef,
      caseId: match.caseId,
      examiner: match.operatorId,
      timestamp: match.date,
      pdfPath: match.path,
      publicKey: check.sigData?.publicKey || '',
      signature: check.sigData?.signature || '',
      errors: check.error ? [check.error] : []
    };
  }

  private renderVerificationHtml(res: http.ServerResponse, result: any): void {
    const isOk = result.isValid === true;
    const badgeColor = isOk ? '#10b981' : '#ef4444';
    const statusText = isOk ? 'CRYPTOGRAPHICALLY VERIFIED' : 'VERIFICATION FAILED / UNVERIFIED';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CyberSanitize Attestation Authority</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #03131e; color: #f1f5f9; padding: 32px 16px; margin: 0; }
    .card { max-width: 680px; margin: 0 auto; background: #082132; border: 1px solid #1e3a53; border-radius: 12px; padding: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; color: #fff; background: ${badgeColor}; }
    h1 { font-size: 20px; margin: 16px 0 8px; color: #e2e8f0; }
    .prop { margin: 12px 0; border-bottom: 1px solid #13334d; padding-bottom: 8px; display: flex; justify-content: space-between; font-size: 13px; }
    .label { color: #94a3b8; }
    .val { color: #38bdf8; font-family: monospace; word-break: break-all; }
    .errors { background: #3b1115; border: 1px solid #7f1d1d; color: #fca5a5; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">${statusText}</span>
    <h1>CyberSanitize Sovereign Verification Authority</h1>
    <div class="prop"><span class="label">Certificate Ref</span><span class="val">${result.certRef || 'N/A'}</span></div>
    <div class="prop"><span class="label">Case ID</span><span class="val">${result.caseId || 'N/A'}</span></div>
    <div class="prop"><span class="label">Examiner</span><span class="val">${result.examiner || 'N/A'}</span></div>
    <div class="prop"><span class="label">Attestation Timestamp</span><span class="val">${result.timestamp || 'N/A'}</span></div>
    <div class="prop"><span class="label">Ed25519 Public Key</span><span class="val">${result.publicKey || 'N/A'}</span></div>
    ${result.errors && result.errors.length > 0 ? `<div class="errors"><strong>Issues:</strong><br>${result.errors.join('<br>')}</div>` : ''}
  </div>
</body>
</html>`;

    res.writeHead(isOk ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}

