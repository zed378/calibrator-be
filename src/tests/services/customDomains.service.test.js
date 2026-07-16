/**
 * Tests for Custom Domains Service (model-based, id-keyed).
 */
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../config", () => ({
  db: { Sequelize: { Op: { ne: "ne_symbol" } } },
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
  User: { findOne: jest.fn() },
}));

jest.mock("../../services/emailQueue.service", () => ({
  emailQueueService: { queueEmail: jest.fn().mockResolvedValue(undefined) },
}));

const svc = require("../../services/customDomains.service");
const { CustomDomain, User } = require("../../models");
const { emailQueueService } = require("../../services/emailQueue.service");

const makeRecord = (over = {}) => {
  const rec = {
    id: "d-1",
    tenantId: "tenant-1",
    domain: "app.example.com",
    domainType: "subdomain",
    status: "pending_verification",
    sslEnabled: true,
    isDefault: false,
    verificationToken: "callibrator-verify=abc123",
    verifiedAt: null,
    lastCheckedAt: null,
    ...over,
  };
  rec.update = jest.fn(async (vals) => {
    Object.assign(rec, vals);
    return rec;
  });
  return rec;
};

describe("customDomainsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CUSTOM_DOMAINS_ENABLED = "true";
    process.env.DEFAULT_SUBDOMAIN = "app";
    process.env.TLS_AUTO_PROVISION = "false";
    CustomDomain.findOne.mockResolvedValue(null);
    CustomDomain.findAll.mockResolvedValue([]);
    CustomDomain.update.mockResolvedValue([1]);
    CustomDomain.create.mockResolvedValue({
      id: "d-1",
      domain: "app.example.com",
      status: "pending_verification",
      sslEnabled: true,
    });
    User.findOne.mockResolvedValue({ email: "admin@example.com" });
  });

  describe("getTenantDomains", () => {
    it("returns the tenant's domains", async () => {
      CustomDomain.findAll.mockResolvedValueOnce([{ domain: "a.com" }]);
      const res = await svc.getTenantDomains("t-1");
      expect(res).toEqual([{ domain: "a.com" }]);
    });
    it("returns [] on failure", async () => {
      CustomDomain.findAll.mockRejectedValueOnce(new Error("db"));
      expect(await svc.getTenantDomains("t-1")).toEqual([]);
    });
  });

  describe("addDomain", () => {
    it("adds a domain from the object form and returns DNS instructions", async () => {
      const res = await svc.addDomain("tenant-1", {
        domain: "app.example.com",
        type: "subdomain",
        sslEnabled: true,
      });
      expect(CustomDomain.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          domain: "app.example.com",
          domainType: "subdomain",
          sslEnabled: true,
          status: "pending_verification",
        }),
      );
      expect(res.verification.cname.value).toBe("cname.callibrator.io.");
      expect(emailQueueService.queueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Verify domain: app.example.com" }),
      );
    });

    it("adds a domain from the string form", async () => {
      const res = await svc.addDomain("tenant-1", "app.example.com", "custom");
      expect(res.domain).toBe("app.example.com");
    });

    it("409s when the domain already exists", async () => {
      CustomDomain.findOne.mockResolvedValueOnce({ domain: "app.example.com", status: "active" });
      await expect(svc.addDomain("tenant-1", "app.example.com")).rejects.toMatchObject({ status: 409 });
    });

    it("400s on invalid domain format", async () => {
      await expect(svc.addDomain("tenant-1", "not a domain")).rejects.toMatchObject({ status: 400 });
    });

    it("400s when disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      await expect(svc.addDomain("tenant-1", "app.example.com")).rejects.toMatchObject({ status: 400 });
    });

    it("400s when tenantId or domain missing", async () => {
      await expect(svc.addDomain(null, "app.example.com")).rejects.toMatchObject({ status: 400 });
      await expect(svc.addDomain("tenant-1", null)).rejects.toMatchObject({ status: 400 });
    });

    it("500s and wraps a DB failure", async () => {
      CustomDomain.create.mockRejectedValueOnce(new Error("DB"));
      await expect(svc.addDomain("tenant-1", "app.example.com")).rejects.toMatchObject({ status: 500 });
    });
  });

  describe("verifyDomain", () => {
    it("activates the domain on successful DNS check", async () => {
      const rec = makeRecord();
      CustomDomain.findOne.mockResolvedValueOnce(rec);
      const res = await svc.verifyDomain("tenant-1", "d-1");
      expect(res.verified).toBe(true);
      expect(res.status).toBe("active");
      expect(rec.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      );
    });

    it("returns disabled result when the feature is off", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      const res = await svc.verifyDomain("tenant-1", "d-1");
      expect(res.verified).toBe(false);
    });

    it("404s when the domain is not owned", async () => {
      CustomDomain.findOne.mockResolvedValueOnce(null);
      await expect(svc.verifyDomain("tenant-1", "missing")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("removeDomain", () => {
    it("soft-deletes the domain", async () => {
      const rec = makeRecord();
      CustomDomain.findOne.mockResolvedValueOnce(rec);
      const res = await svc.removeDomain("tenant-1", "d-1");
      expect(res).toEqual({ success: true, id: "d-1" });
      expect(rec.status).toBe("deleted");
    });
    it("404s when not found", async () => {
      await expect(svc.removeDomain("tenant-1", "missing")).rejects.toMatchObject({ status: 404 });
    });
    it("400s when args are missing", async () => {
      await expect(svc.removeDomain(null, "d-1")).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("getDomainStatus", () => {
    it("returns the domain status", async () => {
      CustomDomain.findOne.mockResolvedValueOnce(makeRecord({ status: "active" }));
      const res = await svc.getDomainStatus("tenant-1", "d-1");
      expect(res).toMatchObject({ id: "d-1", status: "active", isDefault: false });
    });
    it("404s when not found", async () => {
      await expect(svc.getDomainStatus("tenant-1", "missing")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("setDefaultDomain", () => {
    it("clears other defaults and sets this one", async () => {
      const rec = makeRecord({ status: "active" });
      CustomDomain.findOne.mockResolvedValueOnce(rec);
      const res = await svc.setDefaultDomain("tenant-1", "d-1");
      expect(CustomDomain.update).toHaveBeenCalledWith(
        { isDefault: false },
        { where: { tenantId: "tenant-1" } },
      );
      expect(rec.update).toHaveBeenCalledWith({ isDefault: true });
      expect(res.isDefault).toBe(true);
    });
    it("400s for a deleted domain", async () => {
      CustomDomain.findOne.mockResolvedValueOnce(makeRecord({ status: "deleted" }));
      await expect(svc.setDefaultDomain("tenant-1", "d-1")).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("getDnsRecords", () => {
    it("returns TXT + CNAME instructions", async () => {
      CustomDomain.findOne.mockResolvedValueOnce(makeRecord());
      const res = await svc.getDnsRecords("tenant-1", "d-1");
      expect(res.verification.type).toBe("TXT");
      expect(res.cname.type).toBe("CNAME");
    });
  });

  describe("resolveTenantByDomain", () => {
    it("resolves a tenant from an active domain", async () => {
      CustomDomain.findOne.mockResolvedValueOnce({ tenantId: "tenant-9", domain: "x.com" });
      expect(await svc.resolveTenantByDomain("x.com")).toEqual({
        tenantId: "tenant-9",
        domain: "x.com",
      });
    });
    it("returns null when disabled", async () => {
      process.env.CUSTOM_DOMAINS_ENABLED = "false";
      expect(await svc.resolveTenantByDomain("x.com")).toBeNull();
    });
    it("returns null on miss", async () => {
      expect(await svc.resolveTenantByDomain("nope.com")).toBeNull();
    });
  });

  describe("provisionTLSCertificate + status + constants", () => {
    it("provisions when enabled", async () => {
      process.env.TLS_AUTO_PROVISION = "true";
      const res = await svc.provisionTLSCertificate("x.com");
      expect(res.success).toBe(true);
    });
    it("declines when disabled", async () => {
      process.env.TLS_AUTO_PROVISION = "false";
      const res = await svc.provisionTLSCertificate("x.com");
      expect(res.success).toBe(false);
    });
    it("reports status and constants", () => {
      expect(svc.getStatus()).toMatchObject({ enabled: true, defaultSubdomain: "app" });
      expect(svc.DOMAIN_STATUS).toHaveProperty("ACTIVE", "active");
      expect(svc.DOMAIN_TYPE).toHaveProperty("SUBDOMAIN", "subdomain");
    });
  });
});
