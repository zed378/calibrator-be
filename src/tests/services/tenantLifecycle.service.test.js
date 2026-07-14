jest.mock("../../models", () => ({
  Tenant: {
    findByPk: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
  TenantSettings: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    upsert: jest.fn(),
    destroy: jest.fn(),
  },
  User: { destroy: jest.fn(), findAll: jest.fn() },
  Subscription: { destroy: jest.fn(), findAll: jest.fn() },
  Invoice: { destroy: jest.fn(), findAll: jest.fn() },
}));

const tenantLifecycle = require("../../services/tenantLifecycle.service");
const { Tenant, TenantSettings, User, Subscription, Invoice } = require("../../models");

describe("tenantLifecycle.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("suspendTenant", () => {
    it("suspends an active tenant", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "ACTIVE",
        save: jest.fn(),
      });
      TenantSettings.upsert.mockResolvedValue({});

      const result = await tenantLifecycle.suspendTenant("t1", "non-payment", "user-1");

      expect(result.status).toBe("SUSPENDED");
      expect(result.suspensionReason).toBe("non-payment");
    });
  });

  describe("resumeTenant", () => {
    it("resumes a suspended tenant", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "SUSPENDED",
        save: jest.fn(),
      });
      TenantSettings.upsert.mockResolvedValue({});

      const result = await tenantLifecycle.resumeTenant("t1", "user-1");

      expect(result.status).toBe("ACTIVE");
    });
  });

  describe("offboardTenant", () => {
    it("marks tenant as offboarded with retention expiry", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "SUSPENDED",
        save: jest.fn(),
        toJSON: () => ({ id: "t1", status: "SUSPENDED" }),
      });
      TenantSettings.upsert.mockResolvedValue({});
      User.findAll.mockResolvedValue([]);
      Subscription.findAll.mockResolvedValue([]);
      Invoice.findAll.mockResolvedValue([]);
      TenantSettings.findAll.mockResolvedValue([]);

      const result = await tenantLifecycle.offboardTenant("t1");

      expect(result.tenant.status).toBe("OFFBOARDED");
      expect(result.tenant.offboardRetentionExpiresAt).toBeDefined();
    });
  });

  describe("hardDeleteOffboardedTenant", () => {
    it("hard-deletes tenant and related data after retention", async () => {
      const mockDestroy = jest.fn();
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "OFFBOARDED",
        offboardRetentionExpiresAt: new Date(Date.now() - 86400000),
        destroy: mockDestroy,
      });
      User.destroy.mockResolvedValue(3);
      Subscription.destroy.mockResolvedValue(1);
      Invoice.destroy.mockResolvedValue(5);
      TenantSettings.destroy.mockResolvedValue(10);

      await tenantLifecycle.hardDeleteOffboardedTenant("t1");

      expect(User.destroy).toHaveBeenCalledWith({ where: { tenantId: "t1" }, force: true });
      expect(mockDestroy).toHaveBeenCalledWith({ force: true });
    });
  });

  describe("exportTenantData", () => {
    it("exports tenant data for GDPR erasure", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        toJSON: () => ({ id: "t1", name: "Test" }),
      });
      TenantSettings.findAll.mockResolvedValue([]);
      Subscription.findAll.mockResolvedValue([]);
      Invoice.findAll.mockResolvedValue([]);
      User.findAll.mockResolvedValue([]);

      const result = await tenantLifecycle.exportTenantData("t1");

      expect(result.tenant.id).toBe("t1");
      expect(result.exportedAt).toBeDefined();
    });
  });
});
