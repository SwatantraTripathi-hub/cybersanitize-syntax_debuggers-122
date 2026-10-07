import { ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import { ReportService } from '../services/reportService';
import {
  assertPositiveInteger,
  assertSafeText,
  assertString,
  assertCaseId
} from '../security/inputGuard';

export function registerReportIpc(reportService: ReportService = ReportService.getInstance()): void {
  ipcMain.handle('report:generate', async (_, operationId: unknown) => {
    const validId = assertPositiveInteger(operationId, 'operationId');
    return await reportService.generateCertificate(validId);
  });

  ipcMain.handle('report:verify', async (_, pdfPath: unknown, sigPath: unknown) => {
    const validPdf = assertSafeText(pdfPath, 'pdfPath', 4096);
    const validSig = assertSafeText(sigPath, 'sigPath', 4096);
    return reportService.verifyCertificateFile(validPdf, validSig);
  });

  ipcMain.handle('report:verify-file', async (_, pdfPath?: unknown) => {
    if (!pdfPath) return { isValid: false, error: 'No PDF path specified' };
    const validPdf = assertSafeText(pdfPath, 'pdfPath', 4096);
    return reportService.verifyFile(validPdf);
  });

  ipcMain.handle('report:open', async (_, filePath: unknown) => {
    const validPath = assertSafeText(filePath, 'filePath', 4096);
    if (!fs.existsSync(validPath)) {
      throw new Error(`File does not exist: ${validPath}`);
    }
    await shell.openPath(validPath);
    return true;
  });

  ipcMain.handle('report:show-in-folder', async (_, filePath: unknown) => {
    const validPath = assertSafeText(filePath, 'filePath', 4096);
    if (fs.existsSync(validPath)) {
      shell.showItemInFolder(validPath);
      return true;
    }
    return false;
  });

  ipcMain.handle('report:list', async (_, rawCaseId?: unknown) => {
    const caseId = rawCaseId && typeof rawCaseId === 'string' && rawCaseId.trim().length > 0
      ? assertCaseId(rawCaseId.trim())
      : undefined;
    return reportService.listReports(caseId);
  });

  ipcMain.handle('report:clear-all', async () => {
    return reportService.clearReports();
  });

  ipcMain.handle('report:verify-airgap-payload', async (_, payload: unknown) => {
    const validPayload = assertString(payload, 'payload', 32 * 1024);
    return reportService.verifyAirGapPayload(validPayload);
  });

  ipcMain.handle('report:get-qr-data-url', async (_, text: unknown, options?: unknown) => {
    const validText = assertString(text, 'text', 16 * 1024);
    return await reportService.getQrDataUrl(validText, options);
  });
}

