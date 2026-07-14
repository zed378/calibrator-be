/**
 * Tests for Custom Domains Service
 */

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../config", () => ({
  db: {
    getDialect: jest.fn(),
    QueryTypes: { SELECT: "SELECT" },
    Sequelize: { Op: { ne: "ne_symbol" } },
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

jest.mock("../../models", () => ({
  CustomDomain: {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
  User: {
    findOne: jest.fn(),
  },
}));

jest.mock("../../services/emailQueue.service", () => ({
  emailQueueService: {
    queueEmail: jest.fn().mockResolvedValue(undefined),
  },
}));

const {
  verifyDomain,
  addDomain,
  removeDomain,
  getDomainByDomain,
  resolveTenantByDomain,
  getTenantDomains,
  provisionTLSCertificate,
  getStatus,
  DOMAIN_STATUS,
  DOMAIN_TYPE,
} = require("../../services/customDomains.service");

describe("customDomainsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CUSTOM_DOMAINS_ENABLED = "true";
    process.env.DEFAULT_SUBDOMAIN = "app";
    process.env.DNS_CHECK_INTERVAL = "300";
    process.env.TLS_AUTO_PROVISION = "false";

    const { CustomDomain, User } = require("../../models");
    CustomDomain.create.mockResolvedValue({
      domain: "app.example.com",
      status: "pending_verification",
    });
    CustomDomain.update.mockResolvedValue([1]);
    CustomDomain.findOne.mockResolvedValue(null);
    CustomDomain.findAll.mockResolvedValue([]);
    User.findOne.mockResolvedValue({ email: "admin@example.com" });
  });

  afterEach(() => {
    process.env.CUSTOM_DOMAINS_ENABLED = "true";
    process.env.TLS_AUTO_PROVISION = "false";
  });

  describe("verifyDomain", () => {
    it("should return verified with DNS record", async () => {
      const result = await verifyDomain("example.com");

      expect(result).toHaveProperty("verified");
      expect(result).toHaveProperty("record");
      expect(result).toHaveProperty("dnsRecord");
      expect(result.dnsRecord.type).toBe("CNAME");
    });

    it("should return not verified when custom domains disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      const result = await verifyDomain("example.com");

      expect(result.verified).toBe(false);
      expect(result.reason).toBe("Custom domains disabled");
    });
  });

  describe("addDomain", () => {
    it("should throw error for invalid domain format", async () => {
      await expect(addDomain("tenant-1", "not a domain")).rejects.toThrow(
        "Invalid domain format",
      );
    });

    it("should handle database errors gracefully", async () => {
      const { CustomDomain } = require("../../models");
      CustomDomain.create.mockRejectedValueOnce(new Error("DB Error"));

      await expect(
        addDomain("tenant-1", "app.example.com"),
      ).rejects.toThrow("Failed to add domain");
    });

    it("should throw error when custom domains disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";

      await expect(addDomain("tenant-1", "app.example.com")).rejects.toThrow(
        "Custom domains are disabled",
      );
    });

    it("should throw error when tenantId is missing", async () => {
      await expect(addDomain(null, "app.example.com")).rejects.toThrow(
        "tenantId and domain are required",
      );
    });

    it("should throw error when domain is missing", async () => {
      await expect(addDomain("tenant-1", null)).rejects.toThrow(
        "tenantId and domain are required",
      );
    });

    it("should throw error for invalid domain format", async () => {
      await expect(addDomain("tenant-1", "not a domain")).rejects.toThrow(
        "Invalid domain format",
      );
    });
  });

  describe("removeDomain", () => {
    it("should throw error when tenantId is missing", async () => {
      await expect(removeDomain(null, "app.example.com")).rejects.toThrow(
        "tenantId and domain are required",
      );
    });

    it("should throw error when domain is missing", async () => {
      await expect(removeDomain("tenant-1", null)).rejects.toThrow(
        "tenantId and domain are required",
      );
    });
  });

  describe("getDomainByDomain", () => {
    it("should return null when domain not found", async () => {
      const result = await getDomainByDomain("nonexistent.com");

      expect(result).toBeNull();
    });
  });

  describe("resolveTenantByDomain", () => {
    it("should return null when custom domains disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      const result = await resolveTenantByDomain("app.example.com");

      expect(result).toBeNull();
    });

    it("should return null for default subdomain", async () => {
      process.env.DEFAULT_SUBDOMAIN = "app";
      const result = await resolveTenantByDomain("app.callibrator.io");

      expect(result).toBeNull();
    });
  });

  describe("getTenantDomains", () => {
    it("should return empty array when no domains found", async () => {
      const result = await getTenantDomains("tenant-1");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("provisionTLSCertificate", () => {
    it("should return success when TLS auto-provisioning enabled", async () => {
      process.env.TLS_AUTO_PROVISION = "true";
      const result = await provisionTLSCertificate("example.com");

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("certificate");
    });

    it("should return failure when TLS auto-provisioning disabled", async () => {
      process.env.TLS_AUTO_PROVISION = "false";
      const result = await provisionTLSCertificate("example.com");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("TLS auto-provisioning disabled");
    });
  });

  describe("getStatus", () => {
    it("should return service status", () => {
      const status = getStatus();

      expect(status).toHaveProperty("enabled", true);
      expect(status).toHaveProperty("defaultSubdomain", "app");
      expect(status).toHaveProperty("tlsAutoProvision", false);
    });
  });

  describe("constants", () => {
    it("should export DOMAIN_STATUS", () => {
      expect(DOMAIN_STATUS).toHaveProperty("PENDING_VERIFICATION");
      expect(DOMAIN_STATUS).toHaveProperty("ACTIVE");
      expect(DOMAIN_STATUS).toHaveProperty("DELETED");
    });

    it("should export DOMAIN_TYPE", () => {
      expect(DOMAIN_TYPE).toHaveProperty("CUSTOM");
      expect(DOMAIN_TYPE).toHaveProperty("SUBDOMAIN");
    });
  });
});
