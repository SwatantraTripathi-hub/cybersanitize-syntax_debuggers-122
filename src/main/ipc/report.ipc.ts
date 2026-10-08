import { ipcMain, shell, dialog } from "electron";
import { ReportService, getLanIpAddress } from "../services/reportService";
import { AuditService } from "../services/auditService";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { app } from "electron";
import { verificationServer } from "../services/verificationServer";

export function registerReportIpc(auditService: AuditService) {
  const reportService = new ReportService();

  ipcMain.handle("report:generate", async (_, operationId: number) => {
    const operation = auditService.getOperationById(operationId);
    if (!operation) throw new Error(`Operation not found: ${operationId}`);
    return await reportService.generateCertificate(operation);
  });

  ipcMain.handle("report:generate-fleet", async (_, payload: any) => {
    return await reportService.generateFleetCertificate(payload);
  });

  ipcMain.handle(
    "report:verify",
    async (_, pdfPath: string, signaturePath: string) => {
      try {
        const pdfBytes = fs.readFileSync(pdfPath);
        const sigData = JSON.parse(fs.readFileSync(signaturePath, "utf8"));
        const isValid = reportService.verifySignature(
          pdfBytes,
          sigData.signature,
          sigData.publicKey,
        );
        const issuerTrusted =
          sigData.publicKey === reportService.getPublicKey();
        const hashCheck = reportService.verifyCertificateHash(pdfPath);
        return {
          isValid: isValid && issuerTrusted && hashCheck.isValid,
          signatureValid: isValid,
          issuerTrusted,
          hashValid: hashCheck.isValid,
          expectedHash: hashCheck.expectedHash,
          actualHash: hashCheck.actualHash,
          sigData,
          error: null,
        };
      } catch (e: any) {
        return { isValid: false, error: e.message };
      }
    },
  );

  ipcMain.handle("report:open", async (_, pdfPath: string) => {
    await shell.openPath(pdfPath);
    return true;
  });

  ipcMain.handle("report:show-in-folder", async (_, filePath: string) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle("report:list", async (_, caseId?: string) => {
    try {
      const reportsDir = path.join(app.getPath("userData"), "reports");
      if (!fs.existsSync(reportsDir)) return [];
      const files = fs
        .readdirSync(reportsDir)
        .filter((f: string) => f.endsWith(".pdf"));
      const result: any[] = [];
      for (const pdf of files) {
        const fullPdfPath = path.join(reportsDir, pdf);
        const sigPath = fullPdfPath + ".sig";
        let repCaseId = "";
        let repOp = "";
        let repRef = "";
        let qrPayload = "";
        let storedVerifyUrl = "";
        let repSystemHost = "Local Workstation";
        let repNodeId = "LOCAL";
        let isFleetNode = false;
        let isFleetCluster = false;
        let date = fs.statSync(fullPdfPath).mtime.toISOString();
        if (fs.existsSync(sigPath)) {
          try {
            const sigInfo = JSON.parse(fs.readFileSync(sigPath, "utf8"));
            repCaseId = sigInfo.caseId || "";
            repOp = sigInfo.operatorId || "";
            repRef = sigInfo.certRef || "";
            qrPayload = sigInfo.qrPayload || "";
            storedVerifyUrl = sigInfo.verifyUrl || "";
            repSystemHost = sigInfo.systemHost || "Local Workstation";
            repNodeId = sigInfo.nodeId || "LOCAL";
            isFleetNode =
              !!sigInfo.isFleetNode ||
              !!(sigInfo.nodeId && sigInfo.nodeId !== "LOCAL");
            isFleetCluster = !!sigInfo.isFleetCluster;
            if (sigInfo.timestamp) date = sigInfo.timestamp;
          } catch (_) {}
        }
        if (caseId && repCaseId && repCaseId !== caseId) continue;
        const verifierHtmlPath = fullPdfPath.replace(/\.pdf$/, "_verify.html");
        const lanIp = getLanIpAddress();
        const verifyUrl = repRef
          ? `http://${lanIp}:${verificationServer.getPort()}/verify?ref=${encodeURIComponent(repRef)}`
          : storedVerifyUrl ||
            `http://${lanIp}:${verificationServer.getPort()}/verify?ref=${encodeURIComponent(pdf.replace(/\.pdf$/, ""))}`;
        result.push({
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
          systemHost: repSystemHost,
          nodeId: repNodeId,
          isFleetNode,
          isFleetCluster,
        });
      }
      return result.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    } catch (e) {
      console.error("[report:list] Error:", e);
      return [];
    }
  });

  ipcMain.handle("report:clear-all", async () => {
    try {
      const reportsDir = path.join(app.getPath("userData"), "reports");
      if (fs.existsSync(reportsDir)) {
        const files = fs.readdirSync(reportsDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(reportsDir, file));
          } catch (_) {}
        }
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("report:verify-file", async (_, pdfPath?: string) => {
    let targetPath = pdfPath;
    if (!targetPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Select Certificate PDF to Verify",
        filters: [
          { name: "PDF Certificates", extensions: ["pdf"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (canceled || filePaths.length === 0)
        return { success: false, message: "No file selected" };
      targetPath = filePaths[0];
    }
    try {
      const pdfBytes = fs.readFileSync(targetPath);
      const sigPath = targetPath + ".sig";
      const actualHash = crypto
        .createHash("sha256")
        .update(pdfBytes)
        .digest("hex");
      if (!fs.existsSync(sigPath)) {
        return {
          success: true,
          isValid: false,
          signatureValid: false,
          hashValid: false,
          actualHash,
          errors: [
            "No .sig file found alongside this PDF. The certificate cannot be cryptographically verified.",
          ],
        };
      }
      const sigData = JSON.parse(fs.readFileSync(sigPath, "utf8"));
      const sigCandidate = sigData.pdfSignature || sigData.signature;
      let signatureValid = reportService.verifySignature(
        pdfBytes,
        sigCandidate,
        sigData.publicKey,
        sigData.certDigest,
      );
      if (!signatureValid && sigData.evidenceSignature) {
        signatureValid = reportService.verifySignature(
          pdfBytes,
          sigData.evidenceSignature,
          sigData.publicKey,
          sigData.certDigest,
        );
      }
      const hashValid = actualHash === sigData.pdfSha256;
      const issuerTrusted = sigData.publicKey === reportService.getPublicKey();
      const boundCheck = reportService.verifyBoundEvidenceDigest(sigData);
      return {
        success: true,
        isValid:
          (signatureValid || boundCheck.isValid) && issuerTrusted && hashValid,
        signatureValid: signatureValid || boundCheck.signatureValid,
        issuerTrusted,
        hashValid,
        boundDigestValid: boundCheck.isValid,
        actualHash,
        expectedHash: sigData.pdfSha256 || "",
        certRef: sigData.certRef,
        tagId: sigData.tagId,
        title: sigData.title,
        certDigest: sigData.certDigest,
        caseId: sigData.caseId,
        operatorId: sigData.operatorId,
        timestamp: sigData.timestamp,
        publicKey: sigData.publicKey,
        qrPayload: sigData.qrPayload || "",
        errors: issuerTrusted
          ? []
          : ["Certificate was signed by an untrusted issuer key."],
      };
    } catch (e: any) {
      return { success: false, isValid: false, errors: [e.message] };
    }
  });

  ipcMain.handle("report:verify-airgap-payload", async (_, payload: string) => {
    try {
      return reportService.verifyAirGapPayload(payload);
    } catch (e: any) {
      return {
        isValid: false,
        signatureValid: false,
        digestValid: false,
        certRef: "",
        caseId: "",
        tagId: "",
        title: "",
        target: "",
        status: "FAILED",
        standard: "",
        examiner: "",
        timestamp: "",
        preHash: "",
        postHash: "",
        certDigest: "",
        calculatedDigest: "",
        publicKey: "",
        signature: "",
        errors: [e.message],
      };
    }
  });

  ipcMain.handle(
    "report:get-qr-data-url",
    async (_, text: string, options?: any) => {
      try {
        const QRCode = require("qrcode");
        const width = options?.width || 320;
        const margin = options?.margin !== undefined ? options?.margin : 2;
        return await QRCode.toDataURL(text, {
          errorCorrectionLevel: "M",
          margin,
          width,
          color: { dark: "#001c0f", light: "#ffffff" },
        });
      } catch (e: any) {
        return "";
      }
    },
  );
}
