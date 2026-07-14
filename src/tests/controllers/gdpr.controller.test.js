/**
 * Tests for GDPR Controller
 */

jest.mock("../../services/gdpr.service", () => ({
  gdprService: {
    exportUserData: jest.fn(),
    requestErasure: jest.fn(),
    getErasureRequestStatus: jest.fn(),
    updateConsent: jest.fn(),
    getConsentHistory: jest.fn(),
    getProcessingActivities: jest.fn(),
    rectifyData: jest.fn(),
    restrictProcessing: jest.fn(),
  },
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

const { gdprService } = require("../../services/gdpr.service");
const gdprController = require("../../controllers/gdpr.controller");
const { success, error } = require("../../utils/response.util");

describe("gdprController", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { userId: "user-123", tenantId: "tenant-123" },
      query: {},
      body: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {},
    };

    success.mockImplementation((response, data, message) => {
      response.json({ success: true, data, message });
    });
    error.mockImplementation((response, message, status) => {
      response.status(status).json({ success: false, message });
    });
  });

  describe("exportUserData", () => {
    it("should export user data successfully", async () => {
      const mockExport = {
        exportId: "export-123",
        downloadUrl: "/api/v1/gdpr/exports/export-123/download",
        expiresAt: "2024-01-08T00:00:00Z",
        fileSize: 1024000,
      };

      gdprService.exportUserData.mockResolvedValue(mockExport);

      await gdprController.exportUserData(req, res);

      expect(gdprService.exportUserData).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("requestErasure", () => {
    it("should request data erasure successfully", async () => {
      const mockRequest = {
        requestId: "erasure-123",
        status: "pending",
        requestedAt: "2024-01-01T00:00:00Z",
      };

      gdprService.requestErasure.mockResolvedValue(mockRequest);

      req.body = { reason: "User requested account deletion" };

      await gdprController.requestErasure(req, res);

      expect(gdprService.requestErasure).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
        "User requested account deletion",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("getErasureStatus", () => {
    it("should return erasure request status", async () => {
      const mockStatus = {
        requestId: "erasure-123",
        status: "in_progress",
        progress: 50,
      };

      gdprService.getErasureRequestStatus.mockResolvedValue(mockStatus);

      req.params = { requestId: "erasure-123" };

      await gdprController.getErasureStatus(req, res);

      expect(gdprService.getErasureRequestStatus).toHaveBeenCalledWith(
        "tenant-123",
        "erasure-123",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("updateConsent", () => {
    it("should update consent preferences successfully", async () => {
      const mockResult = {
        consentId: "consent-123",
        categories: ["analytics", "marketing"],
        status: "granted",
      };

      gdprService.updateConsent.mockResolvedValue(mockResult);

      req.body = {
        categories: ["analytics", "marketing"],
        consent: true,
      };

      await gdprController.updateConsent(req, res);

      expect(gdprService.updateConsent).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
        ["analytics", "marketing"],
        true,
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("getConsentHistory", () => {
    it("should return consent history", async () => {
      const mockHistory = [
        { id: "c1", purpose: "analytics", status: "granted" },
        { id: "c2", purpose: "marketing", status: "withdrawn" },
      ];

      gdprService.getConsentHistory.mockResolvedValue(mockHistory);

      await gdprController.getConsentHistory(req, res);

      expect(gdprService.getConsentHistory).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("getProcessingActivities", () => {
    it("should return processing activities", async () => {
      const mockActivities = [
        { id: "a1", activity: "data_export", timestamp: "2024-01-01" },
      ];

      gdprService.getProcessingActivities.mockResolvedValue(mockActivities);

      await gdprController.getProcessingActivities(req, res);

      expect(gdprService.getProcessingActivities).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("rectifyData", () => {
    it("should rectify data successfully", async () => {
      const mockResult = {
        field: "email",
        oldValue: "old@example.com",
        newValue: "new@example.com",
      };

      gdprService.rectifyData.mockResolvedValue(mockResult);

      req.body = { field: "email", value: "new@example.com" };

      await gdprController.rectifyData(req, res);

      expect(gdprService.rectifyData).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
        "email",
        "new@example.com",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("restrictProcessing", () => {
    it("should restrict processing successfully", async () => {
      const mockResult = {
        restricted: true,
        reason: "User requested restriction",
        restrictedAt: "2024-01-01T00:00:00Z",
      };

      gdprService.restrictProcessing.mockResolvedValue(mockResult);

      req.body = { reason: "User requested restriction" };

      await gdprController.restrictProcessing(req, res);

      expect(gdprService.restrictProcessing).toHaveBeenCalledWith(
        "user-123",
        "tenant-123",
        "User requested restriction",
      );
      expect(success).toHaveBeenCalled();
    });
  });
});
