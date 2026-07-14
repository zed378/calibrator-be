jest.mock("../../models", () => ({
  Webhook: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  WebhookDelivery: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
  },
}));
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const webhookService = require("../../services/webhook.service");
const { Webhook, WebhookDelivery } = require("../../models");

describe("webhook.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("_sign", () => {
    it("produces a stable 64-char HMAC", () => {
      const a = webhookService._sign("secret", "body");
      const b = webhookService._sign("secret", "body");
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
      expect(webhookService._sign("other", "body")).not.toBe(a);
    });
  });

  describe("emitEvent", () => {
    it("matches subscribed webhooks and enqueues a delivery each", async () => {
      Webhook.findAll.mockResolvedValue([{ id: "w1", url: "http://localhost:1/hook", secret: "s" }]);
      WebhookDelivery.create.mockResolvedValue({
        id: "del1",
        event: "certificate.signed",
        payload: {},
        createdAt: new Date(),
        update: jest.fn().mockResolvedValue(),
      });
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const r = await webhookService.emitEvent("t1", "certificate.signed", { a: 1 });

      expect(r.matched).toBe(1);
      expect(WebhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "t1", webhookId: "w1", event: "certificate.signed" }),
      );
    });

    it("returns matched:0 when no webhook subscribes", async () => {
      Webhook.findAll.mockResolvedValue([]);
      const r = await webhookService.emitEvent("t1", "nothing.subscribed", {});
      expect(r.matched).toBe(0);
      expect(WebhookDelivery.create).not.toHaveBeenCalled();
    });

    it("never throws on a DB error (best-effort)", async () => {
      Webhook.findAll.mockRejectedValue(new Error("db down"));
      const r = await webhookService.emitEvent("t1", "x", {});
      expect(r.matched).toBe(0);
      expect(r.error).toBeDefined();
    });
  });
});
