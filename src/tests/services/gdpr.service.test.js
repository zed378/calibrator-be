/**
 * Tests for GDPR Service
 */

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../config", () => ({
  db: {
    getDialect: jest.fn(),
    Sequelize: { Op: { or: "or_symbol" } },
  },
}));

jest.mock("../../utils/appError.util", () => ({
  AppError: class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("fs", () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
  },
  createWriteStream: jest.fn(() => ({
    on: jest.fn((event, cb) => {
      if (event === "close") cb();
    }),
  })),
  existsSync: jest.fn(),
  rmSync: jest.fn(),
  unlinkSync: jest.fn(),
  directory: jest.fn(),
}));

jest.mock("archiver", () => {
  return jest.fn(() => ({
    on: jest.fn(),
    pipe: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn(),
  }));
});

jest.mock("../../models", () => {
  const model = (overrides = {}) => ({
    findOne: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "rec-1" }),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    ...overrides,
  });
  return {
    User: model({
      findOne: jest.fn().mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        username: "john",
        firstName: "John",
        lastName: "Doe",
        status: "active",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        Role: { name: "USER" },
      }),
      findByPk: jest
        .fn()
        .mockResolvedValue({ id: "user-1", privacyPreferences: { marketing: false } }),
    }),
    Role: model(),
    AuditLog: model(),
    CalibrationDevice: model(),
    CalibrationRecord: model(),
    Certificate: model(),
    ConsentRecord: model(),
    DataRetentionPolicy: model({ findAll: jest.fn().mockResolvedValue([]) }),
    DsarRequest: model(),
  };
});

const gdprService = require("../../services/gdpr.service");
const {
  exportUserData,
  eraseUserData,
  recordConsent,
  withdrawConsent,
  getConsentHistory,
  updatePrivacyPreferences,
  getPrivacyPreferences,
  enforceDataRetention,
  createDsar,
  getDsarStatus,
  getStatus,
} = gdprService;

describe("gdprService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env.GDPR_ENABLED = "true";
    process.env.EXPORT_RETENTION_HOURS = "168";
    process.env.ERASURE_BATCH_SIZE = "100";
    process.env.CONSENT_REQUIRED = "false";
    process.cwd = () => "/tmp/test";
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.GDPR_ENABLED = "true";
  });

  describe("exportUserData", () => {
    it("should throw error when GDPR is disabled", async () => {
      process.env.GDPR_ENABLED = "false";

      await expect(exportUserData("tenant-1", "user-1")).rejects.toThrow(
        "Data export is disabled",
      );
    });

    it("should export user data successfully", async () => {
      const fs = require("fs");
      fs.promises.mkdir.mockResolvedValue(undefined);
      fs.promises.writeFile.mockResolvedValue(undefined);
      fs.promises.stat.mockResolvedValue({ size: 1024 });

      const result = await exportUserData("tenant-1", "user-1");

      expect(result).toHaveProperty("exportId");
      expect(result).toHaveProperty("downloadUrl");
      expect(result).toHaveProperty("expiresAt");
    });
  });

  describe("eraseUserData", () => {
    it("should throw error when GDPR is disabled", async () => {
      process.env.GDPR_ENABLED = "false";

      await expect(eraseUserData("tenant-1", "user-1")).rejects.toThrow(
        "Data erasure is disabled",
      );
    });

    it("should anonymize user by default", async () => {
      const result = await eraseUserData("tenant-1", "user-1");

      expect(result).toHaveProperty("erased", true);
      expect(result).toHaveProperty("method", "anonymized");
      expect(result).toHaveProperty("erasureDate");
    });

    it("should soft delete when anonymize is false", async () => {
      const result = await eraseUserData("tenant-1", "user-1", {
        anonymize: false,
      });

      expect(result.method).toBe("soft_deleted");
    });

    it("should hard delete when hardDelete is true", async () => {
      const result = await eraseUserData("tenant-1", "user-1", {
        hardDelete: true,
        anonymize: false,
      });

      expect(result.method).toBe("hard_deleted");
    });
  });

  describe("recordConsent", () => {
    it("should throw error when GDPR is disabled", async () => {
      process.env.GDPR_ENABLED = "false";

      await expect(
        recordConsent("tenant-1", "user-1", "analytics"),
      ).rejects.toThrow("Consent management is disabled");
    });

    it("should record consent successfully", async () => {
      const result = await recordConsent("tenant-1", "user-1", "analytics");

      expect(result).toHaveProperty("consentId");
    });
  });

  describe("withdrawConsent", () => {
    it("should throw error when GDPR is disabled", async () => {
      process.env.GDPR_ENABLED = "false";

      await expect(
        withdrawConsent("tenant-1", "user-1", "analytics"),
      ).rejects.toThrow("Consent management is disabled");
    });

    it("should withdraw consent successfully", async () => {
      const result = await withdrawConsent("tenant-1", "user-1", "analytics");

      expect(result).toHaveProperty("withdrawn", true);
    });
  });

  describe("getConsentHistory", () => {
    it("should return empty array on error", async () => {
      const result = await getConsentHistory("tenant-1", "user-1");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("updatePrivacyPreferences", () => {
    it("should update privacy preferences", async () => {
      const result = await updatePrivacyPreferences("tenant-1", "user-1", {
        darkMode: true,
      });

      expect(result).toHaveProperty("success", true);
    });
  });

  describe("getPrivacyPreferences", () => {
    it("should return empty object on error", async () => {
      const { User } = require("../../models");
      User.findByPk.mockRejectedValue(new Error("db error"));

      const result = await getPrivacyPreferences("tenant-1", "user-1");

      expect(result).toEqual({});
    });
  });

  describe("enforceDataRetention", () => {
    it("should return disabled when GDPR is disabled", async () => {
      process.env.GDPR_ENABLED = "false";
      const result = await enforceDataRetention();

      expect(result.enforced).toBe(false);
      expect(result.reason).toBe("GDPR disabled");
    });

    it("should enforce data retention", async () => {
      const result = await enforceDataRetention();

      expect(result).toHaveProperty("enforced");
    });
  });

  describe("createDsar", () => {
    it("should create a DSAR", async () => {
      const result = await createDsar("tenant-1", "user-1", "export");

      expect(result).toHaveProperty("dsarId");
    });
  });

  describe("getDsarStatus", () => {
    it("should return null on error", async () => {
      const result = await getDsarStatus("tenant-1", "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getStatus", () => {
    it("should return service status", () => {
      const status = getStatus();

      expect(status).toHaveProperty("enabled", true);
      expect(status).toHaveProperty("exportRetentionHours", 168);
      expect(status).toHaveProperty("consentRequired", false);
    });
  });
});
