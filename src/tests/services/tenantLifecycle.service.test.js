const { Op } = require("sequelize");

jest.mock("../../models", () => ({
  Tenant: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
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
      const mockSave = jest.fn();
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "ACTIVE",
        save: mockSave,
      });
      TenantSettings.upsert.mockResolvedValue({});

      const result = await tenantLifecycle.suspendTenant("t1", "non-payment", "user-1");

      expect(result.status).toBe("SUSPENDED");
      expect(result.suspensionReason).toBe("non-payment");
      expect(mockSave).toHaveBeenCalled();
    });

    it("returns tenant immediately if already suspended", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "SUSPENDED",
      });

      const result = await tenantLifecycle.suspendTenant("t1", "non-payment", "user-1");
      expect(result.status).toBe("SUSPENDED");
    });

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.suspendTenant("t1", "reason")).rejects.toThrow("Tenant not found");
    });
  });

  describe("resumeTenant", () => {
    it("resumes a suspended tenant", async () => {
      const mockSave = jest.fn();
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "SUSPENDED",
        save: mockSave,
      });
      TenantSettings.upsert.mockResolvedValue({});

      const result = await tenantLifecycle.resumeTenant("t1", "user-1");

      expect(result.status).toBe("ACTIVE");
      expect(mockSave).toHaveBeenCalled();
    });

    it("returns tenant immediately if already active", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "ACTIVE",
      });

      const result = await tenantLifecycle.resumeTenant("t1", "user-1");
      expect(result.status).toBe("ACTIVE");
    });

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.resumeTenant("t1")).rejects.toThrow("Tenant not found");
    });
  });

  describe("enterGracePeriod", () => {
    it("enters grace period and stamps expiration", async () => {
      const mockSave = jest.fn();
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        save: mockSave,
      });

      const result = await tenantLifecycle.enterGracePeriod("t1");
      expect(result.gracePeriodExpiresAt).toBeDefined();
      expect(mockSave).toHaveBeenCalled();
    });

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.enterGracePeriod("t1")).rejects.toThrow("Tenant not found");
    });
  });

  describe("checkGracePeriodExpired", () => {
    it("returns false if tenant not found or expiresAt is missing", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      expect(await tenantLifecycle.checkGracePeriodExpired("t1")).toBe(false);

      Tenant.findByPk.mockResolvedValue({ id: "t1" });
      expect(await tenantLifecycle.checkGracePeriodExpired("t1")).toBe(false);
    });

    it("returns true/false based on current date", async () => {
      Tenant.findByPk.mockResolvedValueOnce({
        id: "t1",
        gracePeriodExpiresAt: new Date(Date.now() - 10000),
      });
      expect(await tenantLifecycle.checkGracePeriodExpired("t1")).toBe(true);

      Tenant.findByPk.mockResolvedValueOnce({
        id: "t1",
        gracePeriodExpiresAt: new Date(Date.now() + 10000),
      });
      expect(await tenantLifecycle.checkGracePeriodExpired("t1")).toBe(false);
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

    it("returns immediately if already offboarded and force is false", async () => {
      const mockTenant = {
        id: "t1",
        status: "OFFBOARDED",
      };
      Tenant.findByPk.mockResolvedValue(mockTenant);

      const result = await tenantLifecycle.offboardTenant("t1", false);
      expect(result).toBe(mockTenant);
    });

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.offboardTenant("t1")).rejects.toThrow("Tenant not found");
    });
  });

  describe("cancelOffboarding", () => {
    it("cancels offboarding and resets active state", async () => {
      const mockSave = jest.fn();
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "OFFBOARDED",
        save: mockSave,
      });

      const result = await tenantLifecycle.cancelOffboarding("t1");
      expect(result.status).toBe("ACTIVE");
      expect(result.offboardedAt).toBeNull();
      expect(mockSave).toHaveBeenCalled();
    });

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.cancelOffboarding("t1")).rejects.toThrow("Tenant not found");
    });

    it("throws 400 if tenant is not currently offboarded", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "ACTIVE",
      });
      await expect(tenantLifecycle.cancelOffboarding("t1")).rejects.toThrow("Tenant is not offboarded");
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

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.hardDeleteOffboardedTenant("t1")).rejects.toThrow("Tenant not found");
    });

    it("throws 400 if tenant is not offboarded", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "ACTIVE",
      });
      await expect(tenantLifecycle.hardDeleteOffboardedTenant("t1")).rejects.toThrow("Tenant is not offboarded");
    });

    it("throws 400 if retention period has not expired yet", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "OFFBOARDED",
        offboardRetentionExpiresAt: new Date(Date.now() + 86400000),
      });
      await expect(tenantLifecycle.hardDeleteOffboardedTenant("t1")).rejects.toThrow("Retention period has not expired yet");
    });
  });

  describe("exportTenantData", () => {
    it("exports tenant data successfully", async () => {
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

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.exportTenantData("t1")).rejects.toThrow("Tenant not found");
    });
  });

  describe("getTenantLifecycleStatus", () => {
    it("returns correct tenant status and lifecycle settings", async () => {
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "ACTIVE",
        gracePeriodExpiresAt: null,
        offboardedAt: null,
        offboardRetentionExpiresAt: null,
      });
      TenantSettings.findOne.mockResolvedValue({ value: "ACTIVE" });

      const result = await tenantLifecycle.getTenantLifecycleStatus("t1");
      expect(result.status).toBe("ACTIVE");
      expect(result.lifecycleStatus).toBe("ACTIVE");
    });

    it("throws 404 if tenant not found", async () => {
      Tenant.findByPk.mockResolvedValue(null);
      await expect(tenantLifecycle.getTenantLifecycleStatus("t1")).rejects.toThrow("Tenant not found");
    });
  });

  describe("processExpiredGracePeriods", () => {
    it("offboards suspended tenants whose grace periods have expired", async () => {
      // Mock findAll to return one suspended tenant with expired grace period
      Tenant.findAll.mockResolvedValue([
        {
          id: "t1",
          status: "SUSPENDED",
          gracePeriodExpiresAt: new Date(Date.now() - 10000),
        },
      ]);
      // Mock findByPk for offboardTenant internal call
      Tenant.findByPk.mockResolvedValue({
        id: "t1",
        status: "SUSPENDED",
        save: jest.fn(),
        toJSON: () => ({ id: "t1", status: "SUSPENDED" }),
      });
      User.findAll.mockResolvedValue([]);
      Subscription.findAll.mockResolvedValue([]);
      Invoice.findAll.mockResolvedValue([]);
      TenantSettings.findAll.mockResolvedValue([]);

      const result = await tenantLifecycle.processExpiredGracePeriods();
      expect(result.length).toBe(1);
      expect(result[0].tenantId).toBe("t1");
      expect(result[0].action).toBe("offboarded");
    });
  });
});
