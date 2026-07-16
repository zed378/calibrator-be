/**
 * Tests for certificatePdf.service.js
 *
 * Covers: generateCertificatePdf, getOrCreatePdf, verifyByCertificateNumber,
 * computeIntegrityHash, computeSignature
 */

jest.mock("../../config", () => ({
  Sequelize: { useCLS: jest.fn() },
  db: {},
}));

jest.mock("../../models", () => ({
  Certificate: {
    findOne: jest.fn(),
    update: jest.fn(),
  },
  CalibrationDevice: {},
  Tenant: {},
  User: {},
}));

jest.mock("qrcode", () => ({
  toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,qrdata"),
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockReturnValue("{{tenantName}}"),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
}));

jest.mock("../../utils/storagePath.util", () => (...parts) => `C:/uploads/${parts.join("/")}`);

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("puppeteer", () => {
  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from("mockpdf")),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  };
});

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    createHash: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue("mock-hash-abc123"),
    }),
    createHmac: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue("mock-signature-xyz789"),
    }),
  };
});

const { Certificate } = require("../../models");
const qrCode = require("qrcode");
const fs = require("fs");
const {
  generateCertificatePdf,
  getOrCreatePdf,
  verifyByCertificateNumber,
  computeIntegrityHash,
  computeSignature,
} = require("../../services/certificatePdf.service");

describe("certificatePdf.service", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ================================================================
  describe("computeIntegrityHash", () => {
    it("should return a hex hash string", () => {
      const cert = {
        certificateNumber: "CERT-001",
        tenantId: "t-1",
        deviceId: "d-1",
        calibrationRecordId: "cr-1",
        type: "calibration",
        status: "signed",
        standard: "ISO 17025",
        issueDate: new Date("2025-01-01"),
        validUntil: new Date("2026-01-01"),
        signedBy: "u-1",
        signedAt: new Date("2025-06-01"),
      };

      const hash = computeIntegrityHash(cert);

      expect(typeof hash).toBe("string");
      expect(hash).toHaveLength(16);
    });
  });

  // ================================================================
  describe("computeSignature", () => {
    it("should return an hmac signature", () => {
      const sig = computeSignature("mock-hash-abc123");

      expect(typeof sig).toBe("string");
      expect(sig).toHaveLength(21);
    });
  });

  // ================================================================
  describe("generateCertificatePdf", () => {
    it("should generate a PDF for a valid certificate", async () => {
      const mockCert = {
        id: "c-1",
        certificateNumber: "CERT-001",
        tenantId: "t-1",
        status: "approved",
        type: "calibration",
        standard: "ISO 17025",
        issueDate: new Date("2025-01-01"),
        validUntil: new Date("2026-01-01"),
        summary: "Passed",
        conditions: "None",
        notes: "",
        tenant: { name: "Test Corp", primaryColor: "#4f46e5" },
        device: { name: "Micrometer", serialNumber: "SN123", manufacturer: "Mitutoyo", model: "293" },
        calibratedByUser: { firstName: "John", lastName: "Doe", email: "john@test.com" },
        approvedByUser: { firstName: "Jane", lastName: "Smith", email: "jane@test.com" },
        signedByUser: { firstName: "Bob", lastName: "Admin", email: "bob@test.com" },
        update: jest.fn().mockResolvedValue({}),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await generateCertificatePdf("t-1", "c-1");

      expect(result.success).toBe(true);
      expect(result.data.filePath).toContain("/uploads/certificates/");
      expect(result.data.integrityHash).toBe("mock-hash-abc123");
      expect(result.data.signature).toBe("mock-signature-xyz789");
      expect(qrCode.toDataURL).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockCert.update).toHaveBeenCalledWith(
        expect.objectContaining({ filePath: expect.any(String), fileSize: expect.any(Number) }),
      );
    });

    it("should return 404 when certificate not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await generateCertificatePdf("t-1", "nonexistent");

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.message).toBe("Certificate not found");
    });
  });

  // ================================================================
  describe("getOrCreatePdf", () => {
    it("should return cached PDF if it exists", async () => {
      fs.existsSync.mockReturnValueOnce(true);
      const mockCert = {
        id: "c-1",
        certificateNumber: "CERT-001",
        filePath: "/uploads/certificates/CERT-001.pdf",
        fileSize: 102400,
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await getOrCreatePdf("t-1", "c-1");

      expect(result.success).toBe(true);
      expect(result.data.absPath).toContain("CERT-001.pdf");
      expect(result.data.fileSize).toBe(102400);
    });

    it("should generate PDF if not cached", async () => {
      const mockCert = {
        id: "c-1",
        certificateNumber: "CERT-002",
        tenantId: "t-1",
        status: "approved",
        type: "calibration",
        standard: "ISO 17025",
        issueDate: new Date("2025-01-01"),
        validUntil: new Date("2026-01-01"),
        summary: "Passed",
        conditions: "None",
        notes: "",
        tenant: { name: "Test Corp", primaryColor: "#4f46e5" },
        device: { name: "Caliper", serialNumber: "SN456", manufacturer: "Mitutoyo", model: "500" },
        calibratedByUser: { firstName: "John", lastName: "Doe" },
        approvedByUser: { firstName: "Jane", lastName: "Smith" },
        signedByUser: null,
        update: jest.fn().mockResolvedValue({}),
      };
      // getOrCreatePdf calls loadCertificate first, then generateCertificatePdf calls it again
      Certificate.findOne.mockResolvedValue(mockCert);

      const result = await getOrCreatePdf("t-1", "c-1");

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("should return 404 when certificate not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await getOrCreatePdf("t-1", "nonexistent");

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  // ================================================================
  describe("verifyByCertificateNumber", () => {
    it("should verify a valid certificate", async () => {
      const mockCert = {
        id: "c-1",
        certificateNumber: "CERT-001",
        type: "calibration",
        standard: "ISO 17025",
        status: "signed",
        issuedTo: "Test Corp",
        issueDate: new Date("2025-01-01"),
        validUntil: new Date("2027-01-01"),
        tenant: { name: "Test Corp" },
        device: { name: "Micrometer", serialNumber: "SN123" },
        signedByUser: { firstName: "Bob", lastName: "Admin" },
        signedAt: new Date("2025-06-01"),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await verifyByCertificateNumber("CERT-001");

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(true);
      expect(result.data.valid).toBe(true);
      expect(result.data.status).toBe("signed");
      expect(result.data.integrityHash).toBe("mock-hash-abc123");
    });

    it("should return not found for unknown certificate number", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await verifyByCertificateNumber("UNKNOWN");

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(false);
      expect(result.data.valid).toBe(false);
      expect(result.data.message).toBe("No certificate matches this number.");
    });

    it("should mark revoked certificate as not valid", async () => {
      const mockCert = {
        id: "c-1",
        certificateNumber: "CERT-001",
        status: "revoked",
        type: "calibration",
        standard: "ISO 17025",
        issueDate: new Date("2025-01-01"),
        validUntil: new Date("2027-01-01"),
        tenant: { name: "Test Corp" },
        device: null,
        signedByUser: null,
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await verifyByCertificateNumber("CERT-001");

      expect(result.data.valid).toBe(false);
      expect(result.data.revoked).toBe(true);
    });

    it("should mark expired certificate as not valid", async () => {
      const mockCert = {
        id: "c-1",
        certificateNumber: "CERT-001",
        status: "signed",
        type: "calibration",
        standard: "ISO 17025",
        issueDate: new Date("2020-01-01"),
        validUntil: new Date("2024-01-01"),
        tenant: { name: "Test Corp" },
        device: null,
        signedByUser: null,
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await verifyByCertificateNumber("CERT-001");

      expect(result.data.valid).toBe(false);
      expect(result.data.expired).toBe(true);
    });
  });
});
