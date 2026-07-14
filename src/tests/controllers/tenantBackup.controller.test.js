/**
 * Tests for tenantBackup controller
 */

jest.mock("../../services/tenantBackup.service", () => ({
  createBackup: jest.fn(),
  downloadBackup: jest.fn(),
  restoreBackup: jest.fn(),
  deleteBackup: jest.fn(),
  getBackupStats: jest.fn(),
}));

jest.mock("../../models", () => ({
  TenantBackup: {
    getTenantBackups: jest.fn(),
    findByPk: jest.fn(),
    BACKUP_TYPES: { FULL: "FULL", USER_ONLY: "USER_ONLY" },
    STATUS: {
      IN_PROGRESS: "IN_PROGRESS",
      COMPLETED: "COMPLETED",
      FAILED: "FAILED",
      RESTORING: "RESTORING",
      RESTORED: "RESTORED",
      DELETING: "DELETING",
    },
    createBackup: jest.fn(),
    updateStatus: jest.fn(),
    count: jest.fn(),
    hasValidBackups: jest.fn(),
    getLatestBackup: jest.fn(),
  },
  Users: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  Tenants: {
    findByPk: jest.fn(),
  },
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

const tenantBackupController = require("../../controllers/tenantBackup.controller");
const tenantBackupService = require("../../services/tenantBackup.service");
const { TenantBackup, Users, Tenants } = require("../../models");
const { success } = require("../../utils/response.util");

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";
const BACKUP_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "550e8400-e29b-41d4-a716-446655440002";

describe("tenantBackup Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    success.mockImplementation((res, data, meta, message, status) => {
      res.status(status || 200).json({ success: true, data, message });
    });
    req = {
      params: {},
      body: {},
      query: {},
      user: { id: USER_ID, tenantId: TENANT_ID },
      models: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      download: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("createBackup", () => {
    it("should create a backup successfully", async () => {
      req.params = { tenantId: TENANT_ID };
      req.body = { name: "backup-1", description: "test", backupType: "FULL" };
      tenantBackupService.createBackup.mockResolvedValue({
        success: true,
        status: 201,
        message: "Backup created successfully",
        data: { id: BACKUP_ID, name: "backup-1" },
      });

      await tenantBackupController.createBackup(req, res, next);

      expect(tenantBackupService.createBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          createdById: USER_ID,
          name: "backup-1",
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 400 when name is missing", async () => {
      req.params = { tenantId: TENANT_ID };
      req.body = { description: "no name" };

      await tenantBackupController.createBackup(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 400,
          message: "Backup name is required",
        }),
      );
    });
  });

  describe("getBackups", () => {
    it("should list backups with pagination", async () => {
      req.params = { tenantId: TENANT_ID };
      req.query = { page: "1", limit: "10" };
      TenantBackup.getTenantBackups.mockResolvedValue({
        rows: [{ id: BACKUP_ID, name: "backup-1" }],
        count: 1,
      });

      await tenantBackupController.getBackups(req, res, next);

      expect(TenantBackup.getTenantBackups).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          limit: 10,
          offset: 0,
        }),
        {},
      );
      expect(success).toHaveBeenCalled();
    });

    it("should filter by status", async () => {
      req.params = { tenantId: TENANT_ID };
      req.query = { page: "1", limit: "10", status: "COMPLETED" };
      TenantBackup.getTenantBackups.mockResolvedValue({
        rows: [],
        count: 0,
      });

      await tenantBackupController.getBackups(req, res, next);

      expect(TenantBackup.getTenantBackups).toHaveBeenCalledWith(
        expect.objectContaining({ status: "COMPLETED" }),
        {},
      );
    });
  });

  describe("getBackup", () => {
    it("should return a specific backup", async () => {
      req.params = { backupId: BACKUP_ID };
      const mockBackup = { id: BACKUP_ID, name: "backup-1", toJSON: () => ({ id: BACKUP_ID, name: "backup-1" }) };
      TenantBackup.findByPk.mockResolvedValue(mockBackup);

      await tenantBackupController.getBackup(req, res, next);

      expect(TenantBackup.findByPk).toHaveBeenCalledWith(BACKUP_ID, expect.any(Object));
      expect(success).toHaveBeenCalled();
    });

    it("should return 404 when backup not found", async () => {
      req.params = { backupId: "invalid-id" };
      TenantBackup.findByPk.mockResolvedValue(null);

      await tenantBackupController.getBackup(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 404,
          message: "Backup not found",
        }),
      );
    });
  });

  describe("downloadBackup", () => {
    it("should download a backup file", async () => {
      req.params = { backupId: BACKUP_ID };
      tenantBackupService.downloadBackup.mockResolvedValue({
        filePath: "/backups/backup.zip",
        metadata: { filename: "backup.zip", fileSize: 1024 },
      });

      await tenantBackupController.downloadBackup(req, res, next);

      expect(tenantBackupService.downloadBackup).toHaveBeenCalledWith(BACKUP_ID, {});
      expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", "attachment; filename=\"backup.zip\"");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/zip");
    });
  });

  describe("restoreBackup", () => {
    it("should restore a backup successfully", async () => {
      req.params = { backupId: BACKUP_ID };
      req.body = { mergeData: false };
      tenantBackupService.restoreBackup.mockResolvedValue({
        success: true,
        status: 200,
        message: "Backup restored successfully",
        data: { tenantId: TENANT_ID, recordsProcessed: 5 },
      });

      await tenantBackupController.restoreBackup(req, res, next);

      expect(tenantBackupService.restoreBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          backupId: BACKUP_ID,
          restoredById: USER_ID,
          mergeData: false,
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should restore with mergeData true", async () => {
      req.params = { backupId: BACKUP_ID };
      req.body = { mergeData: true };
      tenantBackupService.restoreBackup.mockResolvedValue({
        status: 200,
        data: { tenantId: TENANT_ID },
      });

      await tenantBackupController.restoreBackup(req, res, next);

      expect(tenantBackupService.restoreBackup).toHaveBeenCalledWith(
        expect.objectContaining({ restoredById: USER_ID, mergeData: true }),
      );
    });
  });

  describe("deleteBackup", () => {
    it("should delete a backup successfully", async () => {
      req.params = { backupId: BACKUP_ID };
      tenantBackupService.deleteBackup.mockResolvedValue({
        success: true,
        status: 200,
        message: "Backup deleted successfully",
        data: null,
      });

      await tenantBackupController.deleteBackup(req, res, next);

      expect(tenantBackupService.deleteBackup).toHaveBeenCalledWith(BACKUP_ID, USER_ID, {});
      expect(success).toHaveBeenCalled();
    });
  });

  describe("getBackupStats", () => {
    it("should return backup statistics", async () => {
      req.params = { tenantId: TENANT_ID };
      tenantBackupService.getBackupStats.mockResolvedValue({
        totalBackups: 5,
        completedBackups: 4,
        failedBackups: 1,
        totalSize: 1048576,
        latestBackup: { id: BACKUP_ID },
        hasValidBackups: true,
      });

      await tenantBackupController.getBackupStats(req, res, next);

      expect(tenantBackupService.getBackupStats).toHaveBeenCalledWith(TENANT_ID, {});
      expect(success).toHaveBeenCalled();
    });
  });
});
