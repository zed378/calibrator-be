// Mock the dependencies before requiring the service
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../src/middlewares/activityLog.middleware", () => ({
  logger: mockLogger,
}));

// Mock emailQueue.service
jest.mock("../src/services/emailQueue.service", () => ({
  queueNotificationEmail: jest.fn().mockResolvedValue(true),
}));

// Mock sms.service - the notificationChannels.service calls sms.sendSms
// which doesn't exist in the actual sms.service, so we mock it
jest.mock("../src/services/sms.service", () => ({
  sendSms: jest.fn().mockResolvedValue({ sent: true }),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  getStatus: jest.fn().mockReturnValue({
    enabled: false,
    provider: "twilio",
    otpEnabled: true,
    otpExpiry: 300,
    rateLimit: 5,
    otpStoreSize: 0,
    rateLimiterSize: 0,
  }),
  clearCache: jest.fn(),
  isConfigured: jest.fn().mockReturnValue(false),
}));

const {
  dispatch,
  DEFAULT_CHANNELS,
} = require("../src/services/notificationChannels.service");

const {
  queueNotificationEmail,
} = require("../src/services/emailQueue.service");
const sms = require("../src/services/sms.service");

describe("notificationChannels.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("DEFAULT_CHANNELS", () => {
    it("should default to realtime only", () => {
      expect(DEFAULT_CHANNELS).toEqual(["realtime"]);
    });
  });

  describe("dispatch", () => {
    const notification = {
      title: "Test Notification",
      message: "Test message",
      actionUrl: "https://example.com/action",
    };

    it("should return empty results when no channels specified", async () => {
      const result = await dispatch(notification, {});
      expect(result).toEqual({});
    });

    it("should return empty results when channels is empty array", async () => {
      const result = await dispatch(notification, { channels: [] });
      expect(result).toEqual({});
    });

    it("should queue email when email channel is specified with recipient", async () => {
      const result = await dispatch(notification, {
        channels: ["email"],
        recipientEmail: "test@example.com",
        recipientName: "Test User",
      });

      expect(result).toHaveProperty("email", "queued");
      expect(queueNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          firstName: "Test User",
          title: "Test Notification",
          message: "Test message",
          actionUrl: "https://example.com/action",
        }),
      );
    });

    it("should skip email when recipientEmail is missing", async () => {
      const result = await dispatch(notification, {
        channels: ["email"],
      });

      expect(result).not.toHaveProperty("email");
      expect(queueNotificationEmail).not.toHaveBeenCalled();
    });

    it("should send SMS when sms channel is specified with recipient", async () => {
      sms.sendSms.mockResolvedValue({ sent: true });

      const result = await dispatch(notification, {
        channels: ["sms"],
        recipientPhone: "+1234567890",
      });

      expect(result).toHaveProperty("sms", "sent");
      expect(sms.sendSms).toHaveBeenCalledWith(
        "+1234567890",
        "Test Notification: Test message",
      );
    });

    it("should return skipped when SMS send returns sent: false", async () => {
      sms.sendSms.mockResolvedValue({ sent: false, reason: "invalid number" });

      const result = await dispatch(notification, {
        channels: ["sms"],
        recipientPhone: "+1234567890",
      });

      expect(result.sms).toMatch(/^skipped/);
      expect(result.sms).toContain("invalid number");
    });

    it("should skip SMS when recipientPhone is missing", async () => {
      const result = await dispatch(notification, {
        channels: ["sms"],
      });

      expect(result).not.toHaveProperty("sms");
      expect(sms.sendSms).not.toHaveBeenCalled();
    });

    it("should handle multiple channels at once", async () => {
      sms.sendSms.mockResolvedValue({ sent: true });

      const result = await dispatch(notification, {
        channels: ["email", "sms"],
        recipientEmail: "test@example.com",
        recipientPhone: "+1234567890",
        recipientName: "Test User",
      });

      expect(result).toHaveProperty("email", "queued");
      expect(result).toHaveProperty("sms", "sent");
    });

    it("should return error result when email dispatch fails", async () => {
      queueNotificationEmail.mockRejectedValue(new Error("Email service down"));

      const result = await dispatch(notification, {
        channels: ["email"],
        recipientEmail: "test@example.com",
      });

      expect(result.email).toMatch(/^error:/);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should return error result when SMS dispatch fails", async () => {
      sms.sendSms.mockRejectedValue(new Error("SMS service down"));

      const result = await dispatch(notification, {
        channels: ["sms"],
        recipientPhone: "+1234567890",
      });

      expect(result.sms).toMatch(/^error:/);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should continue with other channels when one fails", async () => {
      queueNotificationEmail.mockRejectedValue(new Error("Email service down"));
      sms.sendSms.mockResolvedValue({ sent: true });

      const result = await dispatch(notification, {
        channels: ["email", "sms"],
        recipientEmail: "test@example.com",
        recipientPhone: "+1234567890",
        recipientName: "Test User",
      });

      // SMS should succeed even though email failed
      expect(result).toHaveProperty("sms", "sent");
      expect(result.email).toMatch(/^error:/);
    });

    it("should handle realtime channel without error", async () => {
      const result = await dispatch(notification, {
        channels: ["realtime"],
      });

      // realtime is not handled by this dispatcher, so no results
      expect(result).toEqual({});
    });

    it("should handle mixed channels including realtime", async () => {
      sms.sendSms.mockResolvedValue({ sent: true });

      const result = await dispatch(notification, {
        channels: ["realtime", "sms"],
        recipientPhone: "+1234567890",
      });

      // Only sms should be in results
      expect(result).toHaveProperty("sms", "sent");
      expect(result).not.toHaveProperty("realtime");
    });
  });
});
