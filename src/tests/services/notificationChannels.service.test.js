/**
 * Tests for Notification Channels Service
 */

jest.mock("../../services/emailQueue.service", () => ({
  queueNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/sms.service", () => ({
  sendSms: jest.fn().mockResolvedValue({ sent: true }),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import modules AFTER mocks are defined
const { queueNotificationEmail } = require("../../services/emailQueue.service");
const sms = require("../../services/sms.service");
const { logger } = require("../../middlewares/activityLog.middleware");
const notificationChannels = require("../../services/notificationChannels.service");

describe("notificationChannels.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("dispatch", () => {
    it("should return empty results when no channels specified (default realtime only)", async () => {
      const result = await notificationChannels.dispatch(
        { title: "Test", message: "Test message" },
        {},
      );

      expect(result).toEqual({});
    });

    it("should dispatch to email when email channel is specified", async () => {
      const notification = {
        title: "Test Notification",
        message: "Test message",
        actionUrl: "http://example.com/action",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["email"],
        recipientEmail: "user@example.com",
        recipientName: "John",
      });

      expect(result.email).toBe("queued");
      expect(queueNotificationEmail).toHaveBeenCalledWith({
        email: "user@example.com",
        firstName: "John",
        title: "Test Notification",
        message: "Test message",
        actionUrl: "http://example.com/action",
      });
    });

    it("should handle email dispatch failure gracefully", async () => {
      queueNotificationEmail.mockRejectedValueOnce(
        new Error("Email service unavailable"),
      );

      const notification = {
        title: "Test Notification",
        message: "Test message",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["email"],
        recipientEmail: "user@example.com",
      });

      expect(result.email).toBe("error: Email service unavailable");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should dispatch to SMS when sms channel is specified", async () => {
      sms.sendSms.mockResolvedValueOnce({ sent: true });

      const notification = {
        title: "Test Alert",
        message: "Test SMS message",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["sms"],
        recipientPhone: "+1234567890",
      });

      expect(result.sms).toBe("sent");
      expect(sms.sendSms).toHaveBeenCalledWith(
        "+1234567890",
        "Test Alert: Test SMS message",
      );
    });

    it("should handle skipped SMS", async () => {
      sms.sendSms.mockResolvedValueOnce({ sent: false, reason: "blocked" });

      const notification = {
        title: "Test Alert",
        message: "Test SMS message",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["sms"],
        recipientPhone: "+1234567890",
      });

      expect(result.sms).toBe("skipped(blocked)");
    });

    it("should handle SMS dispatch failure gracefully", async () => {
      sms.sendSms.mockRejectedValueOnce(new Error("SMS gateway error"));

      const notification = {
        title: "Test Alert",
        message: "Test SMS message",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["sms"],
        recipientPhone: "+1234567890",
      });

      expect(result.sms).toBe("error: SMS gateway error");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should not dispatch email without recipientEmail", async () => {
      const notification = {
        title: "Test",
        message: "Test",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["email"],
      });

      expect(result).toEqual({});
      expect(queueNotificationEmail).not.toHaveBeenCalled();
    });

    it("should not dispatch SMS without recipientPhone", async () => {
      const notification = {
        title: "Test",
        message: "Test",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["sms"],
      });

      expect(result).toEqual({});
      expect(sms.sendSms).not.toHaveBeenCalled();
    });

    it("should dispatch to multiple channels", async () => {
      const notification = {
        title: "Multi-Channel Alert",
        message: "Important message",
        actionUrl: "http://example.com/action",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["email", "sms"],
        recipientEmail: "user@example.com",
        recipientPhone: "+1234567890",
        recipientName: "Jane",
      });

      expect(result.email).toBe("queued");
      expect(result.sms).toBe("sent");
    });

    it("should continue with other channels when one fails", async () => {
      queueNotificationEmail.mockRejectedValueOnce(new Error("Email failed"));
      sms.sendSms.mockResolvedValueOnce({ sent: true });

      const notification = {
        title: "Multi-Channel Alert",
        message: "Important message",
      };

      const result = await notificationChannels.dispatch(notification, {
        channels: ["email", "sms"],
        recipientEmail: "user@example.com",
        recipientPhone: "+1234567890",
      });

      expect(result.email).toBe("error: Email failed");
      expect(result.sms).toBe("sent");
    });

    it("should use DEFAULT_CHANNELS constant", () => {
      expect(notificationChannels.DEFAULT_CHANNELS).toEqual(["realtime"]);
    });
  });
});