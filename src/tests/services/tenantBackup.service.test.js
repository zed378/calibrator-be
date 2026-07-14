/**
 * Tests for tenantBackup service
 */

// Mock fs module
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn(() => ({
    on: jest.fn(function (event, cb) {
      if (event === "data") {cb(Buffer.from("mock data"));}
      if (event === "end") {cb();}
      return this;
    }),
  })),
};

jest.mock("fs", () => mockFs);

// Mock path module
jest.mock("path", () => ({
  join: jest.fn((...args) => "/mock/" + args.join("/")),
  dirname: jest.fn(() => "/mock"),
  resolve: jest.fn(() => "/mock/resolved"),
}));

// Mock crypto module
jest.mock("crypto", () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(),
    digest: jest.fn(() => "mock-checksum"),
  })),
}));

// Mock JSZip
const mockZipGenerateAsync = jest
  .fn()
  .mockResolvedValue(Buffer.from("mock-zip-data"));
const mockZipFile = jest.fn();
const mockZipLoadAsync = jest.fn();

jest.mock("jszip", () => {
  return jest.fn().mockImplementation(() => ({
    file: mockZipFile,
    generateAsync: mockZipGenerateAsync,
  }));
});

// Mock uuid
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-123"),
}));

// Mock moment
jest.mock("moment", () => {
  const actual = jest.requireActual("moment");
  const mockMoment = jest.fn(() => ({
    format: jest.fn(() => "20240101_120000"),
    subtract: jest.fn().mockReturnThis(),
  }));
  return Object.assign(mockMoment, actual);
});

// Mock models
const mockTenantBackup = {
  createBackup: jest.fn(),
  updateStatus: jest.fn(),
  findByPk: jest.fn(),
  getTenantBackups: jest.fn(),
  getLatestBackup: jest.fn(),
  hasValidBackups: jest.fn(),
  COUNT: jest.fn(),
  count: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  DEFAULT_RETENTION_DAYS: 30,
  BACKUP_TYPES: {
    FULL: "FULL",
    PARTIAL: "PARTIAL",
    USER_ONLY: "USER_ONLY",
  },
  STATUS: {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    RESTORING: "RESTORING",
    RESTORED: "RESTORED",
    DELETING: "DELETING",
  },
};

const mockTenant = {
  findByPk: jest.fn(),
};

const mockUsers = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  bulkCreate: jest.fn(),
  destroy: jest.fn(),
  findOrCreate: jest.fn(),
};

const mockTenantSettings = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  destroy: jest.fn(),
  findOrCreate: jest.fn(),
};

const mockTenantRoles = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  destroy: jest.fn(),
  findOrCreate: jest.fn(),
};

const mockTenantFeatures = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  destroy: jest.fn(),
  findOrCreate: jest.fn(),
};

const mockUserPermissions = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  destroy: jest.fn(),
};

const mockTenantAuditLog = {
  findAll: jest.fn(),
};

const mockSessions = {
  destroy: jest.fn(),
};

const mockSequelize = {
  Op: {
    ne: "$ne",
    or: "$or",
    gte: "$gte",
    lt: "$lt",
  },
  Sequelize: {
    Op: {
      ne: "$ne",
      or: "$or",
      gte: "$gte",
      lt: "$lt",
    },
    UUIDV4: "uuid-v4",
    STRING: "string",
    UUID: "uuid",
    TEXT: "text",
    BOOLEAN: "boolean",
    INTEGER: "integer",
    BIGINT: "bigInt",
    JSONB: "jsonb",
    ENUM: "enum",
    fn: jest.fn((name, col) => `${name}(${col})`),
    col: jest.fn((col) => col),
  },
  transaction: jest.fn().mockResolvedValue({
    commit: jest.fn(),
    rollback: jest.fn(),
  }),
};

jest.mock("../../models", () => ({
  TenantBackup: mockTenantBackup,
  Tenant: mockTenant,
  Users: mockUsers,
  TenantSettings: mockTenantSettings,
  TenantRoles: mockTenantRoles,
  TenantFeatures: mockTenantFeatures,
  UserPermissions: mockUserPermissions,
  TenantAuditLog: mockTenantAuditLog,
  Sessions: mockSessions,
}));

// Mock activity log
jest.mock("../../middlewares/activityLog.middleware", () => ({
  createLogger: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  },
}));

// Mock appError
jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return {
    AppError,
    InternalServerError: class InternalServerError extends Error {
      constructor(message) {
        super(message);
      }
    },
  };
});

const {
  createBackup,
  downloadBackup,
  restoreBackup,
  deleteBackup,
  getBackupStats,
  cleanupExpiredBackups,
} = require("../../services/tenantBackup.service");

describe("Tenant Backup Service", () => {
  const mockTenantId = "tenant-123";
  const mockUserId = "user-456";
  const mockBackupId = "backup-789";

  const mockModels = {
    sequelize: {
      ...mockSequelize,
      models: {
        Users: {
          destroy: jest.fn(),
          bulkCreate: jest.fn(),
          findOrCreate: jest.fn(),
        },
      },
    },
    Sequelize: mockSequelize.Sequelize,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReset();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  describe("createBackup", () => {
    it("should create a backup successfully", async () => {
      const mockBackup = {
        id: mockBackupId,
        tenantId: mockTenantId,
        status: "PENDING",
      };

      const mockTenantData = {
        id: mockTenantId,
        name: "Test Tenant",
        toJSON: jest.fn(() => ({ id: mockTenantId, name: "Test Tenant" })),
      };

      mockTenantBackup.createBackup.mockResolvedValue(mockBackup);
      mockTenantBackup.updateStatus.mockResolvedValue({
        ...mockBackup,
        status: "COMPLETED",
      });
      mockTenant.findByPk.mockResolvedValue(mockTenantData);
      mockTenantSettings.findAll.mockResolvedValue([]);
      mockTenantRoles.findAll.mockResolvedValue([]);
      mockTenantFeatures.findAll.mockResolvedValue([]);
      mockUsers.findAll.mockResolvedValue([]);
      mockUserPermissions.findAll.mockResolvedValue([]);
      mockTenantAuditLog.findAll.mockResolvedValue([]);
      mockZipGenerateAsync.mockResolvedValue(Buffer.from("mock-zip-data"));

      const result = await createBackup({
        tenantId: mockTenantId,
        createdById: mockUserId,
        name: "Test Backup",
        backupType: "FULL",
        models: mockModels,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Backup created successfully");
      expect(mockTenantBackup.createBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          createdById: mockUserId,
          name: "Test Backup",
        }),
        mockModels,
      );
    });

    it("should handle backup creation failure", async () => {
      const mockBackup = {
        id: mockBackupId,
        tenantId: mockTenantId,
        status: "PENDING",
      };

      mockTenantBackup.createBackup.mockResolvedValue(mockBackup);
      mockTenantBackup.updateStatus
        .mockResolvedValueOnce({ ...mockBackup, status: "IN_PROGRESS" })
        .mockResolvedValueOnce({ ...mockBackup, status: "FAILED" });

      const mockTenantData = {
        id: mockTenantId,
        name: "Test Tenant",
        toJSON: jest.fn(() => ({ id: mockTenantId, name: "Test Tenant" })),
      };

      mockTenant.findByPk
        .mockResolvedValueOnce(mockTenantData)
        .mockRejectedValueOnce(new Error("Database error"));

      await expect(
        createBackup({
          tenantId: mockTenantId,
          createdById: mockUserId,
          name: "Test Backup",
          models: mockModels,
        }),
      ).rejects.toThrow("Failed to create backup");
    });
  });

  describe("downloadBackup", () => {
    it("should return backup file path and metadata", async () => {
      const mockBackup = {
        id: mockBackupId,
        status: "COMPLETED",
        filePath: "/mock/backups/backup.zip",
        metadata: { filename: "backup.zip" },
        tenant: { id: mockTenantId },
        creator: { id: mockUserId },
      };

      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);
      mockFs.existsSync.mockReturnValue(true);

      const result = await downloadBackup(mockBackupId, mockModels);

      expect(result.data.filePath).toBe("/mock/backups/backup.zip");
      expect(result.data.metadata).toEqual(mockBackup);
    });

    it("should throw error if backup not found", async () => {
      mockTenantBackup.findByPk.mockResolvedValue(null);

      await expect(downloadBackup("nonexistent", mockModels)).rejects.toThrow(
        "Backup not found",
      );
    });

    it("should throw error if backup is not ready", async () => {
      mockTenantBackup.findByPk.mockResolvedValue({
        id: mockBackupId,
        status: "IN_PROGRESS",
      });

      await expect(downloadBackup(mockBackupId, mockModels)).rejects.toThrow(
        "Backup is not ready for download",
      );
    });
  });

  describe("restoreBackup", () => {
    it("should restore a backup successfully", async () => {
      const mockBackup = {
        id: mockBackupId,
        status: "COMPLETED",
        filePath: "/mock/backups/backup.zip",
        metadata: {},
        tenant: { id: mockTenantId },
      };

      const mockZipData = Buffer.from("mock-zip");
      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(mockZipData);

      // Mock JSZip loadAsync
      const MockJSZip = require("jszip");
      const mockZipInstance = {
        loadAsync: jest.fn().mockResolvedValue({
          files: {
            "tenant_data_full.json": {
              async: jest.fn().mockResolvedValue(
                JSON.stringify({
                  metadata: { version: "1.0" },
                  tenant: { id: mockTenantId },
                  settings: [],
                  tenantRoles: [],
                  tenantFeatures: [],
                  users: [{ username: "test1", email: "test1@example.com" }],
                  userPermissions: [],
                  auditLogs: [],
                }),
              ),
            },
          },
        }),
      };
      MockJSZip.mockImplementation(() => mockZipInstance);

      // Mock transaction
      const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
      mockSequelize.transaction.mockResolvedValue(mockTransaction);

      mockTenantBackup.updateStatus.mockResolvedValue({
        ...mockBackup,
        status: "RESTORED",
      });

      const result = await restoreBackup({
        backupId: mockBackupId,
        restoredById: mockUserId,
        models: mockModels,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Backup restored successfully");
    });

    it("should throw error if backup not found", async () => {
      mockTenantBackup.findByPk.mockResolvedValue(null);

      await expect(
        restoreBackup({
          backupId: "nonexistent",
          restoredById: mockUserId,
          models: mockModels,
        }),
      ).rejects.toThrow("Backup not found");
    });

    it("should throw error if backup file missing", async () => {
      const mockBackup = {
        id: mockBackupId,
        status: "COMPLETED",
        filePath: "/mock/backups/missing.zip",
        metadata: {},
        tenant: { id: mockTenantId },
      };

      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);
      mockFs.existsSync.mockReturnValue(false);

      await expect(
        restoreBackup({
          backupId: mockBackupId,
          restoredById: mockUserId,
          models: mockModels,
        }),
      ).rejects.toThrow("Backup file not found on storage");
    });

    it("should restore a backup successfully with mergeData=false", async () => {
      const mockBackup = {
        id: mockBackupId,
        status: "COMPLETED",
        filePath: "/mock/backups/backup.zip",
      };

      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(Buffer.from("mock-zip-data"));

      const MockJSZip = require("jszip");
      const mockZipInstance = {
        loadAsync: jest.fn().mockResolvedValue({
          files: {
            "tenant_data_full.json": {
              async: jest.fn().mockResolvedValue(
                JSON.stringify({
                  metadata: { version: "1.0" },
                  tenant: { id: mockTenantId },
                  users: [{ username: "test1", email: "test1@example.com" }],
                }),
              ),
            },
          },
        }),
      };
      MockJSZip.mockImplementation(() => mockZipInstance);

      const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockTenantBackup.updateStatus.mockResolvedValue({
        ...mockBackup,
        status: "RESTORED",
      });

      const result = await restoreBackup({
        backupId: mockBackupId,
        restoredById: mockUserId,
        models: mockModels,
        mergeData: false,
      });

      expect(result.success).toBe(true);
      expect(mockUsers.destroy).toHaveBeenCalled();
      expect(mockUsers.bulkCreate).toHaveBeenCalled();
    });

  });

  describe("deleteBackup", () => {
    it("should delete a backup successfully", async () => {
      const mockBackup = {
        id: mockBackupId,
        filePath: "/mock/backups/backup.zip",
        status: "COMPLETED",
        destroy: jest.fn().mockResolvedValue(true),
      };

      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);
      mockFs.existsSync.mockReturnValue(true);

      const result = await deleteBackup(mockBackupId, mockUserId, mockModels);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Backup deleted successfully");
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        "/mock/backups/backup.zip",
      );
      expect(mockBackup.destroy).toHaveBeenCalled();
    });

    it("should throw error if backup not found", async () => {
      mockTenantBackup.findByPk.mockResolvedValue(null);

      await expect(
        deleteBackup("nonexistent", mockUserId, mockModels),
      ).rejects.toThrow("Backup not found");
    });

    it("should handle file deletion failure gracefully", async () => {
      const mockBackup = {
        id: mockBackupId,
        filePath: null,
        status: "COMPLETED",
        destroy: jest.fn().mockResolvedValue(true),
      };

      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);

      const result = await deleteBackup(mockBackupId, mockUserId, mockModels);

      expect(result.success).toBe(true);
    });
  });

  describe("getBackupStats", () => {
    it("should return backup statistics", async () => {
      mockTenantBackup.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8) // completed
        .mockResolvedValueOnce(2); // failed

      mockTenantBackup.findAll.mockResolvedValue([
        { dataValues: { totalSize: 1048576 } },
      ]);

      const mockDate = new Date("2026-01-01T00:00:00Z");
      mockTenantBackup.getLatestBackup.mockResolvedValue({
        id: "latest-backup",
        createdAt: mockDate,
      });

      mockTenantBackup.hasValidBackups.mockResolvedValue(true);

      const stats = await getBackupStats(mockTenantId, mockModels);

      expect(stats.data.totalBackups).toBe(10);
      expect(stats.data.completedBackups).toBe(8);
      expect(stats.data.failedBackups).toBe(2);
      expect(stats.data.totalSize).toBe(1048576);
      expect(stats.data.latestBackup).toEqual({
        id: "latest-backup",
        createdAt: mockDate,
      });
      expect(stats.data.hasValidBackups).toBe(true);
    });
  });

  describe("cleanupExpiredBackups", () => {
    it("should clean up expired backups successfully", async () => {
      const mockBackup1 = {
        id: "backup-1",
        filePath: "/path/to/backup1.zip",
        destroy: jest.fn().mockResolvedValue(),
      };
      const mockBackup2 = {
        id: "backup-2",
        filePath: "/path/to/backup2.zip",
        destroy: jest.fn().mockResolvedValue(),
      };

      mockTenantBackup.findAll.mockResolvedValue([mockBackup1, mockBackup2]);
      mockFs.existsSync.mockReturnValue(true);

      const result = await cleanupExpiredBackups(mockTenantId, mockModels);

      expect(mockTenantBackup.findAll).toHaveBeenCalled();
      expect(mockFs.unlinkSync).toHaveBeenCalledWith("/path/to/backup1.zip");
      expect(mockFs.unlinkSync).toHaveBeenCalledWith("/path/to/backup2.zip");
      expect(mockBackup1.destroy).toHaveBeenCalled();
      expect(mockBackup2.destroy).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        status: 200,
        message: "Expired backups cleanup completed",
        data: { deletedCount: 2 },
      });
    });

    it("should handle error during deletion gracefully", async () => {
      const mockBackup = {
        id: "backup-1",
        filePath: "/path/to/backup1.zip",
        destroy: jest.fn().mockRejectedValue(new Error("Failed to delete")),
      };

      mockTenantBackup.findAll.mockResolvedValue([mockBackup]);
      mockFs.existsSync.mockReturnValue(true);

      const result = await cleanupExpiredBackups(null, mockModels);

      expect(result.data.deletedCount).toBe(0);
    });
  });

  describe("deleteBackup failure handling", () => {
    it("should handle deletion failure and revert status", async () => {
      const mockBackup = {
        id: mockBackupId,
        filePath: "/mock/backups/backup.zip",
        status: "COMPLETED",
        destroy: jest.fn().mockRejectedValue(new Error("Database deletion error")),
      };

      mockTenantBackup.findByPk.mockResolvedValue(mockBackup);
      mockFs.existsSync.mockReturnValue(true);

      await expect(
        deleteBackup(mockBackupId, mockUserId, mockModels),
      ).rejects.toThrow("Failed to delete backup");

      expect(mockTenantBackup.updateStatus).toHaveBeenCalledWith(
        mockBackupId,
        { status: "COMPLETED" },
        mockModels,
      );
    });
  });
});
