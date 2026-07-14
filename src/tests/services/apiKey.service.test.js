jest.mock("../../models", () => ({
  ApiKey: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
  },
  Tenant: {},
}));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const apiKeyService = require("../../services/apiKey.service");
const { ApiKey } = require("../../models");

describe("apiKey.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("scopeAllows", () => {
    const { scopeAllows } = apiKeyService;

    it("'*' allows everything", () => {
      expect(scopeAllows(["*"], "calibration", "write")).toBe(true);
    });
    it("resource:read allows read only", () => {
      expect(scopeAllows(["calibration:read"], "calibration", "read")).toBe(true);
      expect(scopeAllows(["calibration:read"], "calibration", "write")).toBe(false);
    });
    it("resource:write implies read", () => {
      expect(scopeAllows(["calibration:write"], "calibration", "read")).toBe(true);
      expect(scopeAllows(["calibration:write"], "calibration", "write")).toBe(true);
    });
    it("resource:* allows both actions", () => {
      expect(scopeAllows(["calibration:*"], "calibration", "write")).toBe(true);
    });
    it("*:read allows read on any resource but not write", () => {
      expect(scopeAllows(["*:read"], "anything", "read")).toBe(true);
      expect(scopeAllows(["*:read"], "anything", "write")).toBe(false);
    });
    it("bare resource implies write", () => {
      expect(scopeAllows(["calibration"], "calibration", "write")).toBe(true);
    });
    it("is case-insensitive on the resource", () => {
      expect(scopeAllows(["Calibration:read"], "calibration", "read")).toBe(true);
    });
    it("denies an unrelated resource", () => {
      expect(scopeAllows(["certificate:read"], "calibration", "read")).toBe(false);
    });
    it("handles a non-array scopes value", () => {
      expect(scopeAllows(null, "x", "read")).toBe(false);
    });
  });

  describe("createApiKey", () => {
    it("returns the raw key once and persists only a hash + prefix", async () => {
      ApiKey.create.mockImplementation(async (v) => ({ ...v, id: "k1", createdAt: new Date() }));
      const res = await apiKeyService.createApiKey("t1", { name: "n", scopes: ["*"], createdBy: "u1" });
      expect(res.key).toMatch(/^cbk_/);
      expect(res.keyPrefix).toMatch(/^cbk_/);
      const created = ApiKey.create.mock.calls[0][0];
      expect(created.keyHash).toHaveLength(64);
      expect(created.keyHash).not.toContain(res.key);
    });
    it("throws 400 without a name", async () => {
      await expect(apiKeyService.createApiKey("t1", { scopes: ["*"] })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("verifyApiKey", () => {
    it("returns null for a non-cbk key", async () => {
      expect(await apiKeyService.verifyApiKey("xyz")).toBeNull();
    });
    it("returns null when not found", async () => {
      ApiKey.findOne.mockResolvedValue(null);
      expect(await apiKeyService.verifyApiKey("cbk_abc")).toBeNull();
    });
    it("returns null when inactive", async () => {
      ApiKey.findOne.mockResolvedValue({ isActive: false });
      expect(await apiKeyService.verifyApiKey("cbk_abc")).toBeNull();
    });
    it("returns null when expired", async () => {
      ApiKey.findOne.mockResolvedValue({ isActive: true, expiresAt: new Date(Date.now() - 1000) });
      expect(await apiKeyService.verifyApiKey("cbk_abc")).toBeNull();
    });
    it("returns the key when valid and refreshes lastUsedAt", async () => {
      const update = jest.fn().mockResolvedValue();
      ApiKey.findOne.mockResolvedValue({ isActive: true, expiresAt: null, lastUsedAt: null, scopes: ["*"], update });
      const key = await apiKeyService.verifyApiKey("cbk_abc");
      expect(key).toBeTruthy();
      expect(update).toHaveBeenCalled();
    });
  });
});
