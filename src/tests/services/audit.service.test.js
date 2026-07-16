/**
 * Tests for audit.service.js
 *
 * Covers: logAction, fetchAuditLogs
 *
 * NOTE: Service exports are logAction (not logAudit) and fetchAuditLogs (not getAuditLogs).
 * No getAuditStats function exists.
 */

jest.mock("../../config", () => ({
  Sequelize: { useCLS: jest.fn() },
  db: {},
}));

jest.mock("../../models", () => ({
  AuditLog: {
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
  User: {},
}));

jest.mock("sequelize", () => ({
  Op: { gte: Symbol("gte"), lte: Symbol("lte") },
}));

const { AuditLog } = require("../../models");
const auditService = require("../../services/audit.service");

describe("audit.service", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ================================================================
  describe("logAction", () => {
    it("should create an audit log entry", async () => {
      const mockLog = { id: "log-1", tenantId: "t-1" };
      AuditLog.create.mockResolvedValueOnce(mockLog);

      const result = await auditService.logAction({
        tenantId: "t-1",
        userId: "user-1",
        action: "create",
        resourceType: "tenant",
        resourceId: "t-1",
      });

      expect(result).toEqual(mockLog);
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          userId: "user-1",
          action: "create",
          resourceType: "tenant",
          resourceId: "t-1",
        }),
      );
    });

    it("should include optional fields", async () => {
      AuditLog.create.mockResolvedValueOnce({ id: "log-1" });

      await auditService.logAction({
        tenantId: "t-1",
        userId: "user-1",
        action: "login",
        resourceType: "session",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        }),
      );
    });

    it("should return null on error without throwing", async () => {
      AuditLog.create.mockRejectedValueOnce(new Error("DB down"));

      const result = await auditService.logAction({
        tenantId: "t-1",
        userId: "user-1",
        action: "delete",
        resourceType: "user",
        resourceId: "u-1",
      });

      expect(result).toBeNull();
    });

    it("should default resourceId to null when not provided", async () => {
      AuditLog.create.mockResolvedValueOnce({ id: "log-1" });

      await auditService.logAction({
        tenantId: "t-1",
        userId: "user-1",
        action: "update",
        resourceType: "tenant",
      });

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: null }),
      );
    });
  });

  // ================================================================
  describe("fetchAuditLogs", () => {
    it("should return paginated audit logs with defaults", async () => {
      const mockRows = [
        {
          id: "log-1",
          action: "create",
          toJSON: () => ({ id: "log-1", action: "create", createdAt: new Date().toISOString() }),
        },
      ];
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: mockRows });

      const result = await auditService.fetchAuditLogs({ tenantId: "t-1" });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.meta.total).toBe(1);
      expect(result.data.meta.page).toBe(1);
      expect(result.data.rows).toHaveLength(1);
    });

    it("should filter by userId", async () => {
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 5, rows: [] });

      await auditService.fetchAuditLogs({ tenantId: "t-1", userId: "user-1" });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user-1" }),
        }),
      );
    });

    it("should filter by resourceType", async () => {
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

      await auditService.fetchAuditLogs({ tenantId: "t-1", resourceType: "certificate" });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resourceType: "certificate" }),
        }),
      );
    });

    it("should filter by action", async () => {
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

      await auditService.fetchAuditLogs({ tenantId: "t-1", action: "delete" });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: "delete" }),
        }),
      );
    });

    it("should filter by date range using Op.gte/Op.lte", async () => {
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

      await auditService.fetchAuditLogs({
        tenantId: "t-1",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.any(Object),
          }),
        }),
      );
    });

    it("should return empty results when no logs match", async () => {
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

      const result = await auditService.fetchAuditLogs({ tenantId: "t-1" });

      expect(result.data.meta.total).toBe(0);
      expect(result.data.meta.totalPages).toBe(0);
      expect(result.data.rows).toHaveLength(0);
    });

    it("should apply MAX_LIMIT cap on limit", async () => {
      const { MAX_LIMIT } = require("../../constants");
      AuditLog.findAndCountAll.mockResolvedValueOnce({ count: 0, rows: [] });

      await auditService.fetchAuditLogs({ tenantId: "t-1", limit: 99999 });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: MAX_LIMIT,
        }),
      );
    });

    it("should throw on DB error", async () => {
      AuditLog.findAndCountAll.mockRejectedValueOnce(new Error("DB connection failed"));

      await expect(auditService.fetchAuditLogs({ tenantId: "t-1" }))
        .rejects.toMatchObject({ status: 500, message: "DB connection failed" });
    });
  });
});
