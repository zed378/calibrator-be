/**
 * Tests for certificate.service.js
 */

const mockStatus = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  SIGNED: "signed",
  REVOKED: "revoked",
};

jest.mock("../../config");

jest.mock("sequelize", () => {
  const mockSequelize = jest.fn();
  mockSequelize.useCLS = jest.fn();
  return {
    Sequelize: mockSequelize,
    Op: {
      in: Symbol("in"),
      like: Symbol("like"),
      gte: Symbol("gte"),
      lte: Symbol("lte"),
    },
    fn: jest.fn(),
    col: jest.fn(),
  };
});

jest.mock("../../models", () => ({
  Certificate: {
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findAll: jest.fn(),
    generateCertificateNumber: jest.fn(),
    countByStatus: jest.fn(),
    STATUS: mockStatus,
  },
  CalibrationDevice: {
    findOne: jest.fn(),
  },
  Tenant: {
    findByPk: jest.fn(),
  },
  ESignatureRecord: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("../../services/auth.service", () => ({
  passIsValid: jest.fn().mockResolvedValue({ data: { valid: true } }),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return { AppError };
});

jest.mock("../../validators/certificate.validator", () => ({
  validate: jest.fn(),
  createCertificateSchema: "createCertificateSchema",
  updateCertificateSchema: "updateCertificateSchema",
}));

const { Certificate, CalibrationDevice, Tenant } = require("../../models");
const validator = require("../../validators/certificate.validator");
const {
  fetchCertificates,
  fetchSpecificCertificate,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  approveCertificate,
  signCertificate,
  revokeCertificate,
  getCertificateStats,
} = require("../../services/certificate.service");

describe("certificate.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchCertificates", () => {
    it("should fetch certificates successfully without options", async () => {
      Certificate.findAndCountAll.mockResolvedValueOnce({
        rows: [{ id: "cert-1" }],
        count: 1,
      });

      const result = await fetchCertificates({ tenantId: "tenant-1" });

      expect(result.success).toBe(true);
      expect(result.data.rows).toHaveLength(1);
    });

    it("should fetch certificates with options (deviceId, status, type, certNum, date limits, sorting)", async () => {
      Certificate.findAndCountAll.mockResolvedValueOnce({
        rows: [{ id: "cert-1" }],
        count: 1,
      });

      const result = await fetchCertificates({
        tenantId: "tenant-1",
        deviceId: "dev-1",
        status: ["draft"],
        type: ["calibration"],
        certificateNumber: "123",
        from: "2026-06-01",
        to: "2026-06-30",
        sortBy: "certificate_number",
        sortOrder: "ASC",
        page: 2,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(Certificate.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            deviceId: "dev-1",
            status: expect.any(Object),
            type: expect.any(Object),
            certificateNumber: expect.any(Object),
            issuedAt: expect.any(Object),
          }),
          order: [["certificateNumber", "ASC"]],
          limit: 10,
          offset: 10,
        }),
      );
    });

    it("should handle error during fetching", async () => {
      Certificate.findAndCountAll.mockRejectedValueOnce(new Error("Db error"));
      await expect(fetchCertificates({ tenantId: "tenant-1" })).rejects.toThrow("Db error");
    });
  });

  describe("fetchSpecificCertificate", () => {
    it("should fetch specific certificate successfully", async () => {
      Certificate.findOne.mockResolvedValueOnce({ id: "cert-1" });

      const result = await fetchSpecificCertificate("tenant-1", "cert-1");

      expect(result.success).toBe(true);
      expect(result.data.id).toBe("cert-1");
    });

    it("should return 404 if not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await fetchSpecificCertificate("tenant-1", "cert-1");

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should handle error during specific fetching", async () => {
      Certificate.findOne.mockRejectedValueOnce(new Error("Db error"));
      await expect(fetchSpecificCertificate("tenant-1", "cert-1")).rejects.toThrow("Db error");
    });
  });

  describe("createCertificate", () => {
    it("should return 404 if device is not found or belongs to another tenant", async () => {
      validator.validate.mockReturnValueOnce({ deviceId: "dev-1" });
      CalibrationDevice.findOne.mockResolvedValueOnce(null);

      const result = await createCertificate("tenant-1", "user-1", { deviceId: "dev-1" });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should create certificate successfully", async () => {
      validator.validate.mockReturnValueOnce({ deviceId: "dev-1", type: "calibration" });
      CalibrationDevice.findOne.mockResolvedValueOnce({ id: "dev-1" });
      Tenant.findByPk.mockResolvedValueOnce({ code: "TEN" });
      Certificate.generateCertificateNumber.mockResolvedValueOnce("TEN-CERT-001");
      Certificate.create.mockResolvedValueOnce({
        id: "cert-1",
        certificateNumber: "TEN-CERT-001",
      });

      const result = await createCertificate("tenant-1", "user-1", { deviceId: "dev-1" });

      expect(result.success).toBe(true);
      expect(result.status).toBe(201);
      expect(result.data.id).toBe("cert-1");
    });

    it("should handle error during creation", async () => {
      validator.validate.mockReturnValueOnce({ deviceId: "dev-1" });
      CalibrationDevice.findOne.mockRejectedValueOnce(new Error("Db error"));

      await expect(
        createCertificate("tenant-1", "user-1", { deviceId: "dev-1" }),
      ).rejects.toThrow("Db error");
    });
  });

  describe("updateCertificate", () => {
    it("should return 404 if certificate is not found", async () => {
      validator.validate.mockReturnValueOnce({ summary: "New summary" });
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await updateCertificate("tenant-1", "cert-1", { summary: "New summary" });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should return 400 if certificate status is SIGNED or REVOKED", async () => {
      validator.validate.mockReturnValueOnce({ summary: "New summary" });
      Certificate.findOne.mockResolvedValueOnce({
        id: "cert-1",
        status: "signed",
      });

      const result = await updateCertificate("tenant-1", "cert-1", { summary: "New summary" });

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.message).toContain("Cannot update");
    });

    it("should update certificate successfully", async () => {
      validator.validate.mockReturnValueOnce({ summary: "New summary" });
      const mockCert = {
        id: "cert-1",
        status: "draft",
        update: jest.fn().mockResolvedValueOnce(true),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await updateCertificate("tenant-1", "cert-1", {
        summary: "New summary",
        updatedBy: "user-2",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(mockCert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: "New summary",
          updatedBy: "user-2",
        }),
      );
    });

    it("should handle error during update", async () => {
      validator.validate.mockReturnValueOnce({ summary: "New summary" });
      Certificate.findOne.mockRejectedValueOnce(new Error("Db error"));

      await expect(
        updateCertificate("tenant-1", "cert-1", { summary: "New summary" }),
      ).rejects.toThrow("Db error");
    });
  });

  describe("deleteCertificate", () => {
    it("should return 404 if certificate is not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await deleteCertificate("tenant-1", "cert-1");

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should return 400 if certificate is signed", async () => {
      Certificate.findOne.mockResolvedValueOnce({
        id: "cert-1",
        status: "signed",
      });

      const result = await deleteCertificate("tenant-1", "cert-1");

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.message).toContain("Cannot delete signed certificate");
    });

    it("should delete certificate successfully", async () => {
      const mockCert = {
        id: "cert-1",
        status: "draft",
        destroy: jest.fn().mockResolvedValueOnce(true),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await deleteCertificate("tenant-1", "cert-1");

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(mockCert.destroy).toHaveBeenCalled();
    });

    it("should handle error during delete", async () => {
      Certificate.findOne.mockRejectedValueOnce(new Error("Db error"));

      await expect(deleteCertificate("tenant-1", "cert-1")).rejects.toThrow("Db error");
    });
  });

  describe("approveCertificate", () => {
    it("should return 404 if not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await approveCertificate("tenant-1", "cert-1", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Approved" });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should approve certificate successfully", async () => {
      const mockCert = {
        id: "cert-1",
        certificateNumber: "C1",
        approve: jest.fn().mockResolvedValueOnce(true),
        save: jest.fn().mockResolvedValueOnce(true),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await approveCertificate("tenant-1", "cert-1", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Approved" });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(mockCert.approve).toHaveBeenCalled();
      expect(mockCert.approvedBy).toBe("user-2");
      expect(mockCert.save).toHaveBeenCalled();
    });

    it("should handle error during approval", async () => {
      Certificate.findOne.mockRejectedValueOnce(new Error("Db error"));

      await expect(approveCertificate("tenant-1", "cert-1", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Approved" })).rejects.toThrow("Db error");
    });
  });

  describe("signCertificate", () => {
    it("should return 404 if not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await signCertificate("tenant-1", "cert-1", "sig", "k1", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Signed" });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should sign certificate successfully", async () => {
      const mockCert = {
        id: "cert-1",
        certificateNumber: "C1",
        sign: jest.fn().mockResolvedValueOnce(true),
        save: jest.fn().mockResolvedValueOnce(true),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await signCertificate("tenant-1", "cert-1", "sig", "k1", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Signed" });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(mockCert.sign).toHaveBeenCalledWith("sig", "k1");
      expect(mockCert.signedBy).toBe("user-2");
    });

    it("should handle error during signing", async () => {
      Certificate.findOne.mockRejectedValueOnce(new Error("Db error"));

      await expect(
        signCertificate("tenant-1", "cert-1", "sig", "k1", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Signed" }),
      ).rejects.toThrow("Db error");
    });
  });

  describe("revokeCertificate", () => {
    it("should return 404 if not found", async () => {
      Certificate.findOne.mockResolvedValueOnce(null);

      const result = await revokeCertificate("tenant-1", "cert-1", "reason", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Revoked" });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it("should revoke certificate successfully", async () => {
      const mockCert = {
        id: "cert-1",
        certificateNumber: "C1",
        revoke: jest.fn().mockResolvedValueOnce(true),
      };
      Certificate.findOne.mockResolvedValueOnce(mockCert);

      const result = await revokeCertificate("tenant-1", "cert-1", "reason", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Revoked" });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(mockCert.revoke).toHaveBeenCalledWith("reason");
    });

    it("should handle error during revocation", async () => {
      Certificate.findOne.mockRejectedValueOnce(new Error("Db error"));

      await expect(
        revokeCertificate("tenant-1", "cert-1", "reason", "user-2", { authMethod: "password", authPayload: "correct-password", meaning: "Revoked" }),
      ).rejects.toThrow("Db error");
    });
  });

  describe("getCertificateStats", () => {
    it("should fetch statistics successfully", async () => {
      Certificate.count.mockResolvedValueOnce(10);
      Certificate.countByStatus.mockResolvedValueOnce({ approved: 5, signed: 5 });
      Certificate.findAll.mockResolvedValueOnce([
        { type: "calibration", count: "8" },
        { type: "maintenance", count: "2" },
      ]);
      Certificate.findOne.mockResolvedValueOnce({
        id: "cert-latest",
        issuedAt: new Date(),
        device: { name: "Dev 1" },
      });

      const result = await getCertificateStats("tenant-1");

      expect(result.success).toBe(true);
      expect(result.data.totalCertificates).toBe(10);
      expect(result.data.byStatus).toEqual({ approved: 5, signed: 5 });
      expect(result.data.byType).toEqual({ calibration: 8, maintenance: 2 });
    });

    it("should handle error during stats fetching", async () => {
      Certificate.count.mockRejectedValueOnce(new Error("Db error"));
      await expect(getCertificateStats("tenant-1")).rejects.toThrow("Db error");
    });
  });
});
