jest.mock("../../models", () => ({
  Tenant: { findByPk: jest.fn() },
  User: { count: jest.fn() },
  Attachment: { sum: jest.fn() },
}));

const quota = require("../../services/quota.service");
const { Tenant, User, Attachment } = require("../../models");

describe("quota.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("checkSeatQuota", () => {
    it("allows when under the limit", async () => {
      Tenant.findByPk.mockResolvedValue({ limitSeats: 5 });
      User.count.mockResolvedValue(3);
      expect(await quota.checkSeatQuota("t1")).toMatchObject({ allowed: true, used: 3, limit: 5 });
    });
    it("denies at the limit", async () => {
      Tenant.findByPk.mockResolvedValue({ limitSeats: 5 });
      User.count.mockResolvedValue(5);
      expect((await quota.checkSeatQuota("t1")).allowed).toBe(false);
    });
    it("treats a negative limit as unlimited", async () => {
      Tenant.findByPk.mockResolvedValue({ limitSeats: -1 });
      User.count.mockResolvedValue(100);
      const r = await quota.checkSeatQuota("t1");
      expect(r.unlimited).toBe(true);
      expect(r.allowed).toBe(true);
    });
    it("allows when the tenant is missing", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      expect((await quota.checkSeatQuota("t1")).allowed).toBe(true);
    });
  });

  describe("checkStorageQuota", () => {
    it("denies when used + incoming exceeds the limit", async () => {
      Tenant.findByPk.mockResolvedValue({ limitStorageMb: 1 });
      Attachment.sum.mockResolvedValue(1024 * 1024); // 1MB used
      const r = await quota.checkStorageQuota("t1", 1024 * 1024); // +1MB incoming
      expect(r.allowed).toBe(false);
    });
    it("allows within the limit", async () => {
      Tenant.findByPk.mockResolvedValue({ limitStorageMb: 100 });
      Attachment.sum.mockResolvedValue(0);
      expect((await quota.checkStorageQuota("t1", 1024)).allowed).toBe(true);
    });
  });

  describe("checkFeature", () => {
    it("enterprise unlocks api_keys", async () => {
      Tenant.findByPk.mockResolvedValue({ plan: "enterprise" });
      expect((await quota.checkFeature("t1", "api_keys")).allowed).toBe(true);
    });
    it("free does not unlock api_keys", async () => {
      Tenant.findByPk.mockResolvedValue({ plan: "free" });
      expect((await quota.checkFeature("t1", "api_keys")).allowed).toBe(false);
    });
  });

  describe("getUsageSummary", () => {
    it("returns null when the tenant is missing", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      expect(await quota.getUsageSummary("t1")).toBeNull();
    });
    it("summarizes seats, storage, and features", async () => {
      Tenant.findByPk.mockResolvedValue({ plan: "professional", status: "active", limitSeats: 10, limitStorageMb: 100 });
      User.count.mockResolvedValue(4);
      Attachment.sum.mockResolvedValue(2 * 1024 * 1024); // 2MB
      const s = await quota.getUsageSummary("t1");
      expect(s.seats).toEqual({ used: 4, limit: 10 });
      expect(s.storage.usedMb).toBe(2);
      expect(s.features).toContain("reports");
    });
  });
});
