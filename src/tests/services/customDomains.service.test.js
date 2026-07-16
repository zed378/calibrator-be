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

const mockDb = {
  getDialect: jest.fn().mockReturnValue("sqlite"),
  QueryTypes: { SELECT: "SELECT" },
  Sequelize: { Op: { ne: "ne_symbol" } },
  query: jest.fn(),
};

jest.mock("../../config", () => ({
  db: mockDb,
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

const customDomainsService = require("../../services/customDomains.service");
const { CustomDomain, User } = require("../../models");
const { emailQueueService } = require("../../services/emailQueue.service");

describe("customDomainsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CUSTOM_DOMAINS_ENABLED = "true";
    process.env.DEFAULT_SUBDOMAIN = "app";
    process.env.DNS_CHECK_INTERVAL = "300";
    process.env.TLS_AUTO_PROVISION = "false";
    mockDb.getDialect.mockReturnValue("sqlite");

    CustomDomain.create.mockResolvedValue({
      domain: "app.example.com",
      status: "pending_verification",
    });
    CustomDomain.update.mockResolvedValue([1]);
    CustomDomain.findOne.mockResolvedValue(null);
    CustomDomain.findAll.mockResolvedValue([]);
    User.findOne.mockResolvedValue({ email: "admin@example.com" });
    mockDb.query.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env.CUSTOM_DOMAINS_ENABLED = "true";
    process.env.TLS_AUTO_PROVISION = "false";
  });

  describe("verifyDomain", () => {
    it("should return verified with DNS record", async () => {
      const result = await customDomainsService.verifyDomain("example.com");

      expect(result).toHaveProperty("verified");
      expect(result).toHaveProperty("record");
      expect(result).toHaveProperty("dnsRecord");
      expect(result.dnsRecord.type).toBe("CNAME");
    });

    it("should return not verified when custom domains disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      const result = await customDomainsService.verifyDomain("example.com");

      expect(result.verified).toBe(false);
      expect(result.reason).toBe("Custom domains disabled");
    });
  });

  describe("addDomain", () => {
    it("should add domain using Postgres raw SQL", async () => {
      mockDb.getDialect.mockReturnValue("postgres");
      mockDb.query
        .mockResolvedValueOnce([]) // for check existing domain
        .mockResolvedValueOnce([{ domain: "pg.com", status: "pending_verification" }]); // for insertion

      const result = await customDomainsService.addDomain("tenant-1", "pg.com");
      expect(result.domain).toBe("pg.com");
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it("should add domain using SQLite model", async () => {
      const result = await customDomainsService.addDomain("tenant-1", "app.example.com");
      expect(result.domain).toBe("app.example.com");
      expect(CustomDomain.create).toHaveBeenCalled();
    });

    it("should send verification email to admin", async () => {
      await customDomainsService.addDomain("tenant-1", "app.example.com");
      expect(emailQueueService.queueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "admin@example.com",
          subject: "Verify domain: app.example.com",
        })
      );
    });

    it("should handle error when admin email is missing or throws", async () => {
      User.findOne.mockRejectedValueOnce(new Error("User find failed"));
      await customDomainsService.addDomain("tenant-1", "app.example.com");
      // Should not throw, handles warning log
    });

    it("should throw conflict error if domain already exists", async () => {
      CustomDomain.findOne.mockResolvedValueOnce({ domain: "app.example.com", status: "active" });
      await expect(customDomainsService.addDomain("tenant-1", "app.example.com")).rejects.toThrow(
        "Domain already assigned to another tenant"
      );
    });

    it("should throw error for invalid domain format", async () => {
      await expect(customDomainsService.addDomain("tenant-1", "not a domain")).rejects.toThrow(
        "Invalid domain format"
      );
    });

    it("should handle database errors gracefully", async () => {
      CustomDomain.create.mockRejectedValueOnce(new Error("DB Error"));
      await expect(customDomainsService.addDomain("tenant-1", "app.example.com")).rejects.toThrow(
        "Failed to add domain"
      );
    });

    it("should throw error when custom domains disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      await expect(customDomainsService.addDomain("tenant-1", "app.example.com")).rejects.toThrow(
        "Custom domains are disabled"
      );
    });

    it("should throw error when tenantId is missing", async () => {
      await expect(customDomainsService.addDomain(null, "app.example.com")).rejects.toThrow(
        "tenantId and domain are required"
      );
    });

    it("should throw error when domain is missing", async () => {
      await expect(customDomainsService.addDomain("tenant-1", null)).rejects.toThrow(
        "tenantId and domain are required"
      );
    });
  });

  describe("removeDomain", () => {
    it("should remove domain using Postgres raw SQL", async () => {
      mockDb.getDialect.mockReturnValue("postgres");
      const result = await customDomainsService.removeDomain("tenant-1", "pg.com");
      expect(result.success).toBe(true);
      expect(mockDb.query).toHaveBeenCalled();
    });

    it("should remove domain using SQLite model", async () => {
      const result = await customDomainsService.removeDomain("tenant-1", "app.example.com");
      expect(result.success).toBe(true);
      expect(CustomDomain.update).toHaveBeenCalled();
    });

    it("should throw error when removal db transaction throws error", async () => {
      CustomDomain.update.mockRejectedValueOnce(new Error("DB Error"));
      await expect(customDomainsService.removeDomain("tenant-1", "app.example.com")).rejects.toThrow(
        "Failed to remove domain"
      );
    });

    it("should throw error when tenantId is missing", async () => {
      await expect(customDomainsService.removeDomain(null, "app.example.com")).rejects.toThrow(
        "tenantId and domain are required"
      );
    });

    it("should throw error when domain is missing", async () => {
      await expect(customDomainsService.removeDomain("tenant-1", null)).rejects.toThrow(
        "tenantId and domain are required"
      );
    });
  });

  describe("getDomainByDomain", () => {
    it("should retrieve domain using Postgres", async () => {
      mockDb.getDialect.mockReturnValue("postgres");
      mockDb.query.mockResolvedValueOnce([{ domain: "pg.com", status: "active" }]);
      const result = await customDomainsService.getDomainByDomain("pg.com");
      expect(result.domain).toBe("pg.com");
    });

    it("should retrieve domain using SQLite", async () => {
      CustomDomain.findOne.mockResolvedValueOnce({ domain: "sq.com", status: "active" });
      const result = await customDomainsService.getDomainByDomain("sq.com");
      expect(result.domain).toBe("sq.com");
    });

    it("should return null on DB error", async () => {
      CustomDomain.findOne.mockRejectedValueOnce(new Error("DB Error"));
      const result = await customDomainsService.getDomainByDomain("sq.com");
      expect(result).toBeNull();
    });
  });

  describe("resolveTenantByDomain", () => {
    it("should resolve tenant using Postgres", async () => {
      mockDb.getDialect.mockReturnValue("postgres");
      mockDb.query.mockResolvedValueOnce([{ tenantId: "tenant-pg", domain: "pg.com" }]);
      const result = await customDomainsService.resolveTenantByDomain("pg.com");
      expect(result.tenantId).toBe("tenant-pg");
    });

    it("should resolve tenant using SQLite", async () => {
      CustomDomain.findOne.mockResolvedValueOnce({ tenantId: "tenant-sq", domain: "sq.com" });
      const result = await customDomainsService.resolveTenantByDomain("sq.com");
      expect(result.tenantId).toBe("tenant-sq");
    });

    it("should return null when resolution db query fails", async () => {
      CustomDomain.findOne.mockRejectedValueOnce(new Error("DB Error"));
      const result = await customDomainsService.resolveTenantByDomain("sq.com");
      expect(result).toBeNull();
    });

    it("should return null for default subdomain", async () => {
      process.env.DEFAULT_SUBDOMAIN = "app";
      const result = await customDomainsService.resolveTenantByDomain("app.callibrator.io");
      expect(result).toBeNull();
    });
  });

  describe("getTenantDomains", () => {
    it("should list domains using Postgres", async () => {
      mockDb.getDialect.mockReturnValue("postgres");
      mockDb.query.mockResolvedValueOnce([{ domain: "pg.com" }]);
      const result = await customDomainsService.getTenantDomains("t-1");
      expect(result[0].domain).toBe("pg.com");
    });

    it("should list domains using SQLite", async () => {
      CustomDomain.findAll.mockResolvedValueOnce([{ domain: "sq.com" }]);
      const result = await customDomainsService.getTenantDomains("t-1");
      expect(result[0].domain).toBe("sq.com");
    });

    it("should return empty array on failure", async () => {
      CustomDomain.findAll.mockRejectedValueOnce(new Error("DB error"));
      const result = await customDomainsService.getTenantDomains("t-1");
      expect(result).toEqual([]);
    });
  });

  describe("provisionTLSCertificate", () => {
    it("should return success when TLS auto-provisioning enabled", async () => {
      process.env.TLS_AUTO_PROVISION = "true";
      const result = await customDomainsService.provisionTLSCertificate("example.com");

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("certificate");
    });

    it("should return failure when TLS auto-provisioning disabled", async () => {
      process.env.TLS_AUTO_PROVISION = "false";
      const result = await customDomainsService.provisionTLSCertificate("example.com");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("TLS auto-provisioning disabled");
    });
  });

  describe("getStatus", () => {
    it("should return service status", () => {
      const status = customDomainsService.getStatus();

      expect(status).toHaveProperty("enabled", true);
      expect(status).toHaveProperty("defaultSubdomain", "app");
      expect(status).toHaveProperty("tlsAutoProvision", false);
    });
  });

  describe("constants", () => {
    it("should export DOMAIN_STATUS", () => {
      expect(customDomainsService.DOMAIN_STATUS).toHaveProperty("PENDING_VERIFICATION");
      expect(customDomainsService.DOMAIN_STATUS).toHaveProperty("ACTIVE");
      expect(customDomainsService.DOMAIN_STATUS).toHaveProperty("DELETED");
    });

    it("should export DOMAIN_TYPE", () => {
      expect(customDomainsService.DOMAIN_TYPE).toHaveProperty("CUSTOM");
      expect(customDomainsService.DOMAIN_TYPE).toHaveProperty("SUBDOMAIN");
    });
  });
});
