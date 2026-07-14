jest.mock("../../models", () => ({
  AuditLog: { destroy: jest.fn() },
  Notification: { destroy: jest.fn() },
  Session: { destroy: jest.fn() },
  TenantSettings: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    upsert: jest.fn(),
    destroy: jest.fn(),
  },
}));

const dataRetention = require("../../services/dataRetention.service");
const { AuditLog, Notification, Session, TenantSettings } = require("../../models");

describe("dataRetention.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getRetentionPolicy", () => {
    it("returns defaults when no overrides exist", async () => {
      TenantSettings.findAll.mockResolvedValue([]);
      const result = await dataRetention.getRetentionPolicy("t1");
      expect(result.audit_logs).toBe(365);
      expect(result.notifications).toBe(90);
    });
  });

  describe("setRetentionPolicy", () => {
    it("updates retention days for a policy", async () => {
      TenantSettings.upsert.mockResolvedValue({});

      const result = await dataRetention.setRetentionPolicy("t1", "audit_logs", 180);

      expect(TenantSettings.upsert).toHaveBeenCalledWith({
        tenantId: "t1",
        key: "retention_policy_audit_logs",
        value: "180",
      });
      expect(result.days).toBe(180);
    });

    it("rejects unknown policy keys", async () => {
      expect(dataRetention.setRetentionPolicy("t1", "unknown", 30)).rejects.toThrow();
    });
  });

  describe("isOnLegalHold / enable / disable", () => {
    it("reports legal hold status", async () => {
      TenantSettings.findOne.mockResolvedValueOnce({ value: "true" });
      expect(await dataRetention.isOnLegalHold("t1")).toBe(true);

      TenantSettings.findOne.mockResolvedValueOnce(null);
      expect(await dataRetention.isOnLegalHold("t1")).toBe(false);
    });

    it("enables legal hold with reason", async () => {
      TenantSettings.upsert.mockResolvedValue({});
      const result = await dataRetention.enableLegalHold("t1", "user-1", " litigation");
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe(" litigation");
    });

    it("disables legal hold", async () => {
      TenantSettings.destroy.mockResolvedValue(3);
      const result = await dataRetention.disableLegalHold("t1", "user-1");
      expect(result.enabled).toBe(false);
    });
  });

  describe("purgeExpiredRecords", () => {
    it("purges old records per policy", async () => {
      TenantSettings.findOne.mockResolvedValue(null);
      TenantSettings.findAll.mockResolvedValue([]);
      AuditLog.destroy.mockResolvedValue(5);
      Notification.destroy.mockResolvedValue(3);
      Session.destroy.mockResolvedValue(10);

      const result = await dataRetention.purgeExpiredRecords("t1");

      expect(result.purged.audit_logs).toBe(5);
      expect(result.purged.notifications).toBe(3);
      expect(result.purged.sessions).toBe(10);
    });

    it("skips purge when legal hold is active", async () => {
      TenantSettings.findOne.mockResolvedValue({ value: "true" });
      const result = await dataRetention.purgeExpiredRecords("t1");
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("legal_hold");
    });
  });
});
