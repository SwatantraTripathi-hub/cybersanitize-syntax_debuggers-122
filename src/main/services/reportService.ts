import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'
import { sha256Hex } from '../crypto/hash'
import { verifyEntryDigest, verifyDetached } from '../crypto/sign'
import { canonicalizeBytes } from '../crypto/canonical'
import { SecurityError } from '../types/errors'
import { AuditService } from './auditService'
import { ServiceContext } from './serviceContext'

function cleanWinAnsi(text: string): string {
  if (!text) return ''
  return String(text)
    .replace(/[≈∼]/g, '~=')
    .replace(/[—–]/g, '-')
    .replace(/[“”"]/g, '"')
    .replace(/[‘’']/g, "'")
    .replace(/[•·]/g, '*')
    .replace(/[✓✔]/g, '[OK]')
    .replace(/[✗✘]/g, '[FAIL]')
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[≠]/g, '!=')
    .replace(/[±]/g, '+/-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/ {2,}/g, ' ')
}

export function getLanIpAddress(): string {
  const interfaces = os.networkInterfaces()
  let candidate = '127.0.0.1'
  for (const name of Object.keys(interfaces)) {
    const isVirtual = /vethernet|virtual|vbox|wsl|docker|loopback/i.test(name)
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!isVirtual) return iface.address
        if (candidate === '127.0.0.1') candidate = iface.address
      }
    }
  }
  return candidate
}

export class ReportService {
  private static instance: ReportService | null = null
  private readonly auditService: AuditService
  private readonly context: ServiceContext

  constructor(context: ServiceContext = ServiceContext.getInstance()) {
    this.context = context
    this.auditService = new AuditService(context)
  }

  public static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService()
    }
    return ReportService.instance
  }

  public async generateCertificate(operationId: number): Promise<{
    success: boolean
    filePath: string
    certRef: string
    signature: string
    publicKey: string
    verifyUrl: string
    qrDataUrl: string
  }> {
    const operation = await this.auditService.getOperationById(operationId)
    if (!operation) {
      throw new SecurityError(
        'NOT_FOUND',
        `Cannot generate certificate: Audit operation #${operationId} does not exist`,
      )
    }

    const certRef = `CERT-CS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(operation.id).padStart(5, '0')}`
    const lanIp = getLanIpAddress()
    const verifyUrl = `http://${lanIp}:3847/verify?ref=${encodeURIComponent(certRef)}`

    // Build signed air-gap payload
    const airGapPayload = {
      v: 1,
      ref: certRef,
      opId: operation.id,
      case: operation.case_id,
      op: operation.operation,
      target: operation.target,
      status: operation.status,
      operator: operation.operator,
      at: operation.timestamp,
      tip: operation.entry_hash,
    }
    const airGapBytes = canonicalizeBytes(airGapPayload)
    const airGapSig = this.context.keystore.sign(airGapBytes)
    const compactQrString = JSON.stringify({
      ...airGapPayload,
      sig: airGapSig,
      pk: this.context.keystore.getPublicKeyHex(),
    })

    const qrDataUrl = await QRCode.toDataURL(compactQrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 200,
    })
    const qrImageBuffer = Buffer.from(
      qrDataUrl.replace(/^data:image\/png;base64,/, ''),
      'base64',
    )

    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const qrImage = await pdfDoc.embedPng(qrImageBuffer)

    // Draw header
    page.drawRectangle({
      x: 36,
      y: 770,
      width: 523,
      height: 40,
      color: rgb(0.02, 0.12, 0.18),
    })

    page.drawText('CYBERSANITIZE FORENSIC CERTIFICATE OF SANITIZATION', {
      x: 48,
      y: 785,
      size: 13,
      font: fontBold,
      color: rgb(1, 1, 1),
    })

    // Subtitle & Certificate reference
    page.drawText(`Certificate Ref: ${certRef}`, {
      x: 36,
      y: 745,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.6),
    })
    page.drawText(
      `ISO/IEC 27037 & NIST SP 800-88 Rev. 1 Compliant Attestation`,
      {
        x: 36,
        y: 730,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      },
    )

    // Metadata grid
    const startY = 700
    const lineHeight = 20
    const fields = [
      ['Case ID:', operation.case_id],
      ['Operation Type:', operation.operation],
      ['Target Device/Path:', cleanWinAnsi(operation.target)],
      ['Final Status:', operation.status],
      ['Authorizing Examiner:', operation.operator],
      ['Execution Timestamp:', operation.timestamp],
      ['Audit Entry ID:', `#${operation.id}`],
      ['Pre-Sanitization Hash:', operation.hash_before || 'NOT_CALCULATED'],
      ['Post-Sanitization Hash:', operation.hash_after || 'NOT_CALCULATED'],
      ['Entry Hash (SHA-256):', operation.entry_hash],
      ['Prev Hash (Chain Tip):', operation.prev_hash],
    ]

    for (let i = 0; i < fields.length; i++) {
      const y = startY - i * lineHeight
      page.drawText(fields[i][0], {
        x: 36,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      })
      page.drawText(cleanWinAnsi(fields[i][1]), {
        x: 170,
        y,
        size: 8.5,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
    }

    // QR Code for air-gap verification
    page.drawImage(qrImage, {
      x: 395,
      y: 430,
      width: 150,
      height: 150,
    })
    page.drawText('Scan to verify air-gapped signature', {
      x: 400,
      y: 418,
      size: 7.5,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })

    // Verification Authority Footer
    page.drawRectangle({
      x: 36,
      y: 40,
      width: 523,
      height: 48,
      color: rgb(0.95, 0.96, 0.98),
    })
    page.drawText('SOVEREIGN CRYPTOGRAPHIC ATTESTATION', {
      x: 46,
      y: 72,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.3),
    })
    page.drawText(
      `Ed25519 Public Key: ${this.context.keystore.getPublicKeyHex()}`,
      {
        x: 46,
        y: 58,
        size: 7,
        font,
        color: rgb(0.3, 0.3, 0.3),
      },
    )
    page.drawText(`Live Verification URL: ${verifyUrl}`, {
      x: 46,
      y: 47,
      size: 7,
      font,
      color: rgb(0.2, 0.4, 0.7),
    })

    // Serialize PDF
    const pdfBytes = await pdfDoc.save()
    const pdfSha256 = sha256Hex(Buffer.from(pdfBytes))

    // Sign the PDF digest
    const pdfSignature = this.context.keystore.signEntryDigest(pdfSha256)
    const publicKeyHex = this.context.keystore.getPublicKeyHex()

    // Write PDF file
    const safeTitle = `Certificate_${certRef}_${operation.case_id}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    )
    const pdfFileName = `${safeTitle}.pdf`
    const pdfFilePath = path.join(this.context.reportsDir, pdfFileName)
    fs.writeFileSync(pdfFilePath, Buffer.from(pdfBytes))

    // Write signature metadata file (.sig)
    const sigMetadata = {
      certRef,
      operationId: operation.id,
      caseId: operation.case_id,
      operatorId: operation.operator,
      timestamp: operation.timestamp,
      pdfSha256,
      signature: pdfSignature,
      publicKey: publicKeyHex,
      qrPayload: compactQrString,
      verifyUrl,
    }
    fs.writeFileSync(
      `${pdfFilePath}.sig`,
      JSON.stringify(sigMetadata, null, 2),
      'utf8',
    )

    // Write self-contained air-gap HTML verification artifact
    const htmlPath = pdfFilePath.replace(/\.pdf$/, '_verify.html')
    const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Certificate Verification: ${certRef}</title>
<style>body{font-family:sans-serif;background:#03131e;color:#e6edf3;padding:24px;line-height:1.5;}
.box{background:#0b2135;border:1px solid #1f4260;border-radius:8px;padding:20px;max-width:700px;margin:auto;}
h1{color:#38bdf8;font-size:18px;margin-top:0;}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;background:#0284c7;color:#fff;font-weight:bold;font-size:12px;}
pre{background:#020b12;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;color:#38bdf8;}
</style>
</head>
<body>
<div class="box">
  <span class="tag">VERIFIED CRYPTOGRAPHIC RECORD</span>
  <h1>CyberSanitize Forensic Verification</h1>
  <p><strong>Certificate Reference:</strong> ${certRef}</p>
  <p><strong>Case ID:</strong> ${operation.case_id}</p>
  <p><strong>Operation:</strong> ${operation.operation}</p>
  <p><strong>Target:</strong> ${cleanWinAnsi(operation.target)}</p>
  <p><strong>Status:</strong> ${operation.status}</p>
  <p><strong>Examiner:</strong> ${operation.operator}</p>
  <p><strong>Timestamp:</strong> ${operation.timestamp}</p>
  <p><strong>PDF SHA-256 Digest:</strong></p>
  <pre>${pdfSha256}</pre>
  <p><strong>Ed25519 Signature:</strong></p>
  <pre>${pdfSignature}</pre>
  <p><strong>Public Key:</strong></p>
  <pre>${publicKeyHex}</pre>
</div>
</body>
</html>`
    fs.writeFileSync(htmlPath, htmlContent, 'utf8')

    return {
      success: true,
      filePath: pdfFilePath,
      certRef,
      signature: pdfSignature,
      publicKey: publicKeyHex,
      verifyUrl,
      qrDataUrl,
    }
  }

  public verifyCertificateFile(
    pdfPath: string,
    signaturePath: string,
  ): {
    isValid: boolean
    signatureValid: boolean
    hashValid: boolean
    expectedHash: string
    actualHash: string
    sigData: any
    error: string | null
  } {
    try {
      if (!fs.existsSync(pdfPath) || !fs.existsSync(signaturePath)) {
        return {
          isValid: false,
          signatureValid: false,
          hashValid: false,
          expectedHash: '',
          actualHash: '',
          sigData: null,
          error: 'Certificate file or signature file not found',
        }
      }

      const pdfBytes = fs.readFileSync(pdfPath)
      const actualHash = sha256Hex(pdfBytes)
      const sigData = JSON.parse(fs.readFileSync(signaturePath, 'utf8'))

      const hashValid =
        actualHash.toLowerCase() === (sigData.pdfSha256 || '').toLowerCase()
      const signatureValid = verifyEntryDigest(
        actualHash,
        sigData.signature,
        sigData.publicKey,
      )
      const isValid = hashValid && signatureValid

      return {
        isValid,
        signatureValid,
        hashValid,
        expectedHash: sigData.pdfSha256 || '',
        actualHash,
        sigData,
        error: null,
      }
    } catch (err: any) {
      return {
        isValid: false,
        signatureValid: false,
        hashValid: false,
        expectedHash: '',
        actualHash: '',
        sigData: null,
        error: err.message,
      }
    }
  }

  public verifyFile(pdfPath?: string): any {
    if (!pdfPath) {
      return { isValid: false, error: 'No PDF path provided' }
    }
    const sigPath = `${pdfPath}.sig`
    return this.verifyCertificateFile(pdfPath, sigPath)
  }

  public listReports(caseId?: string): Array<{
    id: string
    path: string
    verifierHtmlPath: string
    hasVerifierHtml: boolean
    title: string
    certRef: string
    caseId: string
    operatorId: string
    date: string
    qrPayload: string
    verifyUrl: string
  }> {
    const reportsDir = this.context.reportsDir
    if (!fs.existsSync(reportsDir)) return []

    const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.pdf'))
    const results: any[] = []
    const lanIp = getLanIpAddress()

    for (const pdf of files) {
      const fullPdfPath = path.join(reportsDir, pdf)
      const sigPath = `${fullPdfPath}.sig`
      let repCaseId = ''
      let repOp = ''
      let repRef = ''
      let qrPayload = ''
      let storedVerifyUrl = ''
      let date = fs.statSync(fullPdfPath).mtime.toISOString()

      if (fs.existsSync(sigPath)) {
        try {
          const sigInfo = JSON.parse(fs.readFileSync(sigPath, 'utf8'))
          repCaseId = sigInfo.caseId || ''
          repOp = sigInfo.operatorId || ''
          repRef = sigInfo.certRef || ''
          qrPayload = sigInfo.qrPayload || ''
          storedVerifyUrl = sigInfo.verifyUrl || ''
          if (sigInfo.timestamp) date = sigInfo.timestamp
        } catch {
          // ignore
        }
      }

      if (caseId && repCaseId && repCaseId !== caseId) continue

      const verifierHtmlPath = fullPdfPath.replace(/\.pdf$/, '_verify.html')
      const verifyUrl =
        storedVerifyUrl ||
        (repRef
          ? `http://${lanIp}:3847/verify?ref=${encodeURIComponent(repRef)}`
          : `http://${lanIp}:3847/verify?ref=${encodeURIComponent(pdf.replace(/\.pdf$/, ''))}`)

      results.push({
        id: pdf,
        path: fullPdfPath,
        verifierHtmlPath,
        hasVerifierHtml: fs.existsSync(verifierHtmlPath),
        title: pdf,
        certRef: repRef,
        caseId: repCaseId,
        operatorId: repOp,
        date,
        qrPayload,
        verifyUrl,
      })
    }

    return results.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  }

  public clearReports(): { success: boolean; clearedCount: number } {
    const dir = this.context.reportsDir
    if (!fs.existsSync(dir)) return { success: true, clearedCount: 0 }
    const files = fs.readdirSync(dir)
    let count = 0
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(dir, f))
        count++
      } catch {
        // ignore
      }
    }
    return { success: true, clearedCount: count }
  }

  public verifyAirGapPayload(payload: string): {
    isValid: boolean
    signatureValid: boolean
    digestValid: boolean
    certRef: string
    caseId: string
    tagId: string
    title: string
    target: string
    status: string
    standard: string
    examiner: string
    timestamp: string
    preHash: string
    postHash: string
    certDigest: string
    calculatedDigest: string
    publicKey: string
    signature: string
    errors: string[]
  } {
    const errors: string[] = []
    try {
      const data = JSON.parse(payload)
      const { sig, pk, ...rest } = data

      if (!sig || !pk) {
        return {
          isValid: false,
          signatureValid: false,
          digestValid: false,
          certRef: data.ref || '',
          caseId: data.case || '',
          tagId: '',
          title: '',
          target: data.target || '',
          status: data.status || '',
          standard: '',
          examiner: data.operator || '',
          timestamp: data.at || '',
          preHash: '',
          postHash: '',
          certDigest: '',
          calculatedDigest: '',
          publicKey: pk || '',
          signature: sig || '',
          errors: ['Missing cryptographic signature or public key in payload'],
        }
      }

      const canonicalBytes = canonicalizeBytes(rest)
      const calculatedDigest = sha256Hex(canonicalBytes)
      const signatureValid = this.context.keystore
        ? verifyDetached(canonicalBytes, sig, pk)
        : false

      if (!signatureValid) {
        errors.push('Ed25519 signature verification failed')
      }

      return {
        isValid: signatureValid,
        signatureValid,
        digestValid: true,
        certRef: data.ref || '',
        caseId: data.case || '',
        tagId: '',
        title: `Forensic Attestation: ${data.ref || ''}`,
        target: data.target || '',
        status: data.status || '',
        standard: '',
        examiner: data.operator || '',
        timestamp: data.at || '',
        preHash: '',
        postHash: '',
        certDigest: calculatedDigest,
        calculatedDigest,
        publicKey: pk,
        signature: sig,
        errors,
      }
    } catch (err: any) {
      return {
        isValid: false,
        signatureValid: false,
        digestValid: false,
        certRef: '',
        caseId: '',
        tagId: '',
        title: '',
        target: '',
        status: '',
        standard: '',
        examiner: '',
        timestamp: '',
        preHash: '',
        postHash: '',
        certDigest: '',
        calculatedDigest: '',
        publicKey: '',
        signature: '',
        errors: [err.message],
      }
    }
  }

  public async getQrDataUrl(text: string, options?: any): Promise<string> {
    return QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: options?.width || 250,
    })
  }
}
