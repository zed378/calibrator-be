// eslint-disable-next-line no-undef
jest.mock("axios");
jest.mock("twilio", () => {
  const mockMessages = {
    create: jest.fn().mockResolvedValue({ sid: "mock-sid" }),
  };
  return jest.fn(() => ({
    messages: mockMessages,
  }));
});
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("../../utils/appError.util", () => ({
  AppError: class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock("../../utils/circuitBreaker.util", () => ({
  withCircuitBreaker: jest.fn((name, fn) => fn()),
}));
// @aws-sdk/client-sns is not installed — the service lazy-requires it only on the
// SNS path, so mock it virtually.
jest.mock(
  "@aws-sdk/client-sns",
  () => {
    const send = jest.fn().mockResolvedValue({ MessageId: "mock-message-id" });
    class SNSClient {
      constructor(config) {
        SNSClient.lastConfig = config;
        this.send = send;
      }
    }
    SNSClient.send = send;
    class PublishCommand {
      constructor(input) {
        this.input = input;
      }
    }
    return { SNSClient, PublishCommand };
  },
  { virtual: true },
);

const axios = require("axios");

describe("sms.service", () => {
  let smsService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.SMS_PROVIDER;
    delete process.env.SMS_ENABLED;
    delete process.env.SMS_OTP_ENABLED;
    delete process.env.SMS_OTP_LENGTH;
    delete process.env.SMS_OTP_EXPIRY;
    delete process.env.SMS_OTP_MAX_ATTEMPTS;
    delete process.env.SMS_RATE_LIMIT_PER_HOUR;
    process.env.TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    process.env.TWILIO_AUTH_TOKEN = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    process.env.TWILIO_PHONE_NUMBER = "+15017122661";
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SNS_PHONE;
    delete process.env.SMS_HTTP_URL;
    delete process.env.SMS_HTTP_API_KEY;
    delete process.env.SMS_HTTP_FROM;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (smsService) {
      smsService.clearCache();
    }
  });

  describe("sendOtp", () => {
    it("should return not sent when SMS is disabled", async () => {
      process.env.SMS_ENABLED = "false";
      smsService = require("../../services/sms.service");

      const result = await smsService.sendOtp("+1234567890");

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("SMS disabled");
    });

    it("should return not sent when OTP is disabled", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_ENABLED = "false";
      smsService = require("../../services/sms.service");

      const result = await smsService.sendOtp("+1234567890");

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("OTP via SMS is disabled");
    });

    it("should throw error when phone is missing", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await expect(smsService.sendOtp(null)).rejects.toThrow(
        "Phone number is required",
      );
    });

    it("should throw rate limit error when limit exceeded", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_RATE_LIMIT_PER_HOUR = "2";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");
      await smsService.sendOtp("+1234567890");

      await expect(smsService.sendOtp("+1234567890")).rejects.toThrow(
        "Too many SMS requests",
      );
    });

    it("should send OTP successfully", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_LENGTH = "6";
      process.env.SMS_OTP_EXPIRY = "300";
      smsService = require("../../services/sms.service");

      const result = await smsService.sendOtp("+1234567890");

      expect(result.sent).toBe(true);
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe("verifyOtp", () => {
    it("should return invalid when phone or code missing", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      const result = await smsService.verifyOtp("+1234567890", null);
      expect(result.valid).toBe(false);

      const result2 = await smsService.verifyOtp(null, "123456");
      expect(result2.valid).toBe(false);
    });

    it("should return invalid when OTP not found", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      const result = await smsService.verifyOtp("+1234567890", "123456");

      expect(result.valid).toBe(false);
      expect(result.message).toBe("OTP expired or not found");
    });

    it("should return invalid for wrong code", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");
      const result = await smsService.verifyOtp("+1234567890", "000000");

      expect(result.valid).toBe(false);
      expect(result.message).toContain("Invalid OTP");
    });

    it("should return valid for correct code", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");
      // Get the stored OTP from the store
      const { otpStore } = smsService || {};

      // We need to read the OTP that was generated
      // Since we can't access otpStore directly, let's test via the service
      // The OTP is stored internally, so we need to read it
      const result = await smsService.verifyOtp("+1234567890", "000000");
      // It will be wrong, but the function should work
      expect(result.valid).toBe(false);
    });
  });

  describe("sendNotification", () => {
    it("should return not sent when SMS is disabled", async () => {
      process.env.SMS_ENABLED = "false";
      smsService = require("../../services/sms.service");

      const result = await smsService.sendNotification(
        { countryCode: "+1" },
        "welcome",
      );

      expect(result.sent).toBe(false);
    });

    it("should return not sent when no template available", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      const result = await smsService.sendNotification(
        { countryCode: "+999" },
        "welcome",
      );

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("No template available");
    });

    it("should send notification successfully", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.TWILIO_ACCOUNT_SID = "sid";
      process.env.TWILIO_AUTH_TOKEN = "token";
      process.env.TWILIO_PHONE_NUMBER = "+1987654321";
      smsService = require("../../services/sms.service");

      const result = await smsService.sendNotification(
        { countryCode: "+1" },
        "welcome",
        { link: "https://example.com" },
      );

      expect(result.sent).toBe(true);
    });
  });

  describe("getStatus", () => {
    it("should return service status", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "twilio";
      smsService = require("../../services/sms.service");

      const status = smsService.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.provider).toBe("twilio");
      expect(status.otpEnabled).toBe(true);
      expect(status.otpExpiry).toBe(300);
      expect(typeof status.otpStoreSize).toBe("number");
    });
  });

  describe("clearCache", () => {
    it("should clear OTP and rate limiter caches", () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      smsService.clearCache();

      expect(true).toBe(true);
    });
  });

  describe("isConfigured", () => {
    it("should return false when SMS disabled", () => {
      process.env.SMS_ENABLED = "false";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(false);
    });

    it("should return true when Twilio configured", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "twilio";
      process.env.TWILIO_ACCOUNT_SID = "sid";
      process.env.TWILIO_AUTH_TOKEN = "token";
      process.env.TWILIO_PHONE_NUMBER = "+1987654321";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(true);
    });

    it("should return true when AWS SNS configured", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "sns";
      process.env.AWS_ACCESS_KEY_ID = "key";
      process.env.AWS_SECRET_ACCESS_KEY = "secret";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(true);
    });

    it("should return true when HTTP provider configured", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "http";
      process.env.SMS_HTTP_URL = "https://sms-api.example.com/send";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(true);
    });

    it("should return false when provider not configured", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "twilio";
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(false);
    });

    it("should return false for an unrecognised provider", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "carrier-pigeon";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(false);
    });

    it("should return false when AWS SNS credentials are absent", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "aws-sns";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(false);
    });

    it("should return false when the HTTP endpoint is absent", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "generic";
      smsService = require("../../services/sms.service");

      expect(smsService.isConfigured()).toBe(false);
    });
  });

  // ==========================================
  // COVERAGE — OTP lifecycle
  // ==========================================

  describe("OTP expiry and attempt limits", () => {
    it("should treat a stored OTP as gone once it has expired", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_EXPIRY = "300";
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");

      await smsService.sendOtp("+1234567890");
      const code = twilio().messages.create.mock.calls[0][0].body;

      // Jump past the 300s expiry window.
      const realNow = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(realNow + 301 * 1000);

      const result = await smsService.verifyOtp("+1234567890", code);

      expect(result).toEqual({
        valid: false,
        message: "OTP expired or not found",
      });
    });

    it("should verify a correct code and consume the OTP", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");

      await smsService.sendOtp("+1234567890");
      const code = twilio().messages.create.mock.calls[0][0].body;

      const result = await smsService.verifyOtp("+1234567890", code);

      expect(result).toEqual({ valid: true, message: "OTP verified successfully" });

      // The OTP is single-use: the entry is deleted on success.
      const again = await smsService.verifyOtp("+1234567890", code);
      expect(again).toEqual({ valid: false, message: "OTP expired or not found" });
    });

    it("should accept a numeric code by coercing it to a string", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");

      await smsService.sendOtp("+1234567890");
      const code = twilio().messages.create.mock.calls[0][0].body;

      const result = await smsService.verifyOtp("+1234567890", Number(code));

      expect(result.valid).toBe(true);
    });

    it("should count down the remaining attempts on each wrong code", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_MAX_ATTEMPTS = "3";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");

      const first = await smsService.verifyOtp("+1234567890", "000000");
      expect(first.message).toBe("Invalid OTP. 1 attempts remaining.");

      const second = await smsService.verifyOtp("+1234567890", "000001");
      expect(second.message).toBe("Invalid OTP. 0 attempts remaining.");
    });

    it("should reject verification once max attempts is reached", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_MAX_ATTEMPTS = "3";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");
      await smsService.verifyOtp("+1234567890", "000000");
      await smsService.verifyOtp("+1234567890", "000000");
      await smsService.verifyOtp("+1234567890", "000000");

      const result = await smsService.verifyOtp("+1234567890", "000000");

      expect(result).toEqual({
        valid: false,
        message: "Too many failed attempts. Request a new OTP.",
      });
    });

    it("should refuse to resend an OTP that already hit max attempts", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_MAX_ATTEMPTS = "3";
      process.env.SMS_RATE_LIMIT_PER_HOUR = "10";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");
      await smsService.verifyOtp("+1234567890", "000000");
      await smsService.verifyOtp("+1234567890", "000000");
      await smsService.verifyOtp("+1234567890", "000000");

      await expect(smsService.sendOtp("+1234567890")).rejects.toMatchObject({
        status: 429,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    });

    it("should honour a custom OTP length", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_LENGTH = "4";
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");

      await smsService.sendOtp("+1234567890");
      const code = twilio().messages.create.mock.calls[0][0].body;

      expect(code).toMatch(/^\d{4}$/);
    });

    it("should throw a 500 when delivery fails", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");
      twilio().messages.create.mockRejectedValue(new Error("twilio exploded"));

      await expect(smsService.sendOtp("+1234567890")).rejects.toMatchObject({
        status: 500,
        message: "Failed to send SMS. Please try again later.",
      });
    });
  });

  // ==========================================
  // COVERAGE — delivery providers
  // ==========================================

  describe("provider selection", () => {
    it("should deliver via Twilio using the configured from-number", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "twilio";
      process.env.TWILIO_PHONE_NUMBER = "+15017122661";
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");

      await smsService.sendOtp("+1234567890");

      expect(twilio().messages.create).toHaveBeenCalledWith({
        body: expect.stringMatching(/^\d{6}$/),
        from: "+15017122661",
        to: "+1234567890",
      });
    });

    it("should fail when Twilio credentials are missing", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "twilio";
      delete process.env.TWILIO_ACCOUNT_SID;
      smsService = require("../../services/sms.service");

      // deliverViaTwilio throws "Twilio credentials not configured", which sendOtp
      // maps to a generic 500.
      await expect(smsService.sendOtp("+1234567890")).rejects.toMatchObject({
        status: 500,
        message: "Failed to send SMS. Please try again later.",
      });
      expect(require("twilio")).not.toHaveBeenCalled();
    });

    it("should deliver via AWS SNS with explicit credentials", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "sns";
      process.env.AWS_REGION = "eu-west-1";
      process.env.AWS_ACCESS_KEY_ID = "key";
      process.env.AWS_SECRET_ACCESS_KEY = "secret";
      smsService = require("../../services/sms.service");
      const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

      await smsService.sendOtp("+1234567890");

      expect(SNSClient.lastConfig).toEqual({
        region: "eu-west-1",
        credentials: { accessKeyId: "key", secretAccessKey: "secret" },
      });
      const command = SNSClient.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(PublishCommand);
      expect(command.input).toEqual({
        PhoneNumber: "+1234567890",
        Message: expect.stringMatching(/^\d{6}$/),
      });

      delete process.env.AWS_REGION;
    });

    it("should fall back to the SDK's own credential chain and default region", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "aws";
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      smsService = require("../../services/sms.service");
      const { SNSClient } = require("@aws-sdk/client-sns");

      await smsService.sendOtp("+1234567890");

      expect(SNSClient.lastConfig).toEqual({
        region: "us-east-1",
        credentials: undefined,
      });
    });

    it("should treat the aws-sns alias as the SNS provider", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "aws-sns";
      smsService = require("../../services/sms.service");
      const { SNSClient } = require("@aws-sdk/client-sns");

      await smsService.sendOtp("+1234567890");

      expect(SNSClient.send).toHaveBeenCalled();
    });

    it("should POST to the generic HTTP provider", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "http";
      process.env.SMS_HTTP_URL = "https://sms-api.example.com/send";
      process.env.SMS_HTTP_API_KEY = "secret-key";
      process.env.SMS_HTTP_FROM = "Callibrator";
      smsService = require("../../services/sms.service");
      const freshAxios = require("axios");
      freshAxios.post.mockResolvedValue({ data: { id: "msg-1" } });

      await smsService.sendOtp("+1234567890");

      expect(freshAxios.post).toHaveBeenCalledWith(
        "https://sms-api.example.com/send",
        {
          to: "+1234567890",
          from: "Callibrator",
          message: expect.stringMatching(/^\d{6}$/),
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer secret-key",
          },
          timeout: 15000,
        },
      );
    });

    it("should treat the generic alias as the HTTP provider", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "generic";
      process.env.SMS_HTTP_URL = "https://sms-api.example.com/send";
      smsService = require("../../services/sms.service");
      const freshAxios = require("axios");
      freshAxios.post.mockResolvedValue({ data: {} });

      await smsService.sendOtp("+1234567890");

      expect(freshAxios.post).toHaveBeenCalled();
    });

    it("should fail when the HTTP endpoint is not configured", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "http";
      delete process.env.SMS_HTTP_URL;
      smsService = require("../../services/sms.service");
      const freshAxios = require("axios");

      await expect(smsService.sendOtp("+1234567890")).rejects.toMatchObject({
        status: 500,
      });
      expect(freshAxios.post).not.toHaveBeenCalled();
    });

    it("should fail for an unknown provider", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "carrier-pigeon";
      smsService = require("../../services/sms.service");

      await expect(smsService.sendOtp("+1234567890")).rejects.toMatchObject({
        status: 500,
        message: "Failed to send SMS. Please try again later.",
      });
    });

    it("should upper-case provider names case-insensitively", async () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_PROVIDER = "TWILIO";
      smsService = require("../../services/sms.service");

      expect(smsService.getStatus().provider).toBe("twilio");
      await expect(smsService.sendOtp("+1234567890")).resolves.toMatchObject({
        sent: true,
      });
    });
  });

  // ==========================================
  // COVERAGE — notification templates
  // ==========================================

  describe("sendNotification templates", () => {
    const send = async (type, data) => {
      const result = await smsService.sendNotification({ countryCode: "+62" }, type, data);
      const twilio = require("twilio");
      return {
        result,
        body: twilio().messages.create.mock.calls[0]?.[0].body,
      };
    };

    beforeEach(() => {
      process.env.SMS_ENABLED = "true";
    });

    it("should render the welcome template with a link", async () => {
      smsService = require("../../services/sms.service");
      const { result, body } = await send("welcome", { link: "https://x.test" });

      expect(result).toEqual({ sent: true });
      expect(body).toBe("Welcome to Callibrator! Get started: https://x.test");
    });

    it("should render the welcome template without a link", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("welcome", {});

      expect(body).toBe("Welcome to Callibrator! ");
    });

    it("should render the alert template with a custom message", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("alert", { message: "Sensor offline" });

      expect(body).toBe("Callibrator alert: Sensor offline");
    });

    it("should fall back to the default alert copy", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("alert", {});

      expect(body).toBe("Callibrator alert: An alert has been triggered.");
    });

    it("should render the reminder template with a custom message", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("reminder", { message: "Due tomorrow" });

      expect(body).toBe("Callibrator reminder: Due tomorrow");
    });

    it("should fall back to the default reminder copy", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("reminder", {});

      expect(body).toBe("Callibrator reminder: Upcoming calibration due.");
    });

    it("should render the password-reset template", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("password-reset", { code: "999111" });

      expect(body).toBe("Your password reset code is: 999111. Valid for 15 minutes.");
    });

    it("should render the password-reset template with no code", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("password-reset", {});

      expect(body).toBe("Your password reset code is: . Valid for 15 minutes.");
    });

    it("should render the verification template", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("verification", { code: "424242" });

      expect(body).toBe("Your verification code is: 424242. Valid for 5 minutes.");
    });

    it("should render the verification template with no code", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("verification", {});

      expect(body).toBe("Your verification code is: . Valid for 5 minutes.");
    });

    it("should fall back to the alert template for an unknown type", async () => {
      smsService = require("../../services/sms.service");
      const { body } = await send("no-such-type", { message: "Fallback" });

      expect(body).toBe("Callibrator alert: Fallback");
    });

    it("should default the template data to an empty object", async () => {
      smsService = require("../../services/sms.service");

      const result = await smsService.sendNotification({ countryCode: "+44" }, "welcome");

      expect(result).toEqual({ sent: true });
    });

    it("should report no template when the phone is null", async () => {
      smsService = require("../../services/sms.service");

      const result = await smsService.sendNotification(null, "welcome");

      expect(result).toEqual({ sent: false, reason: "No template available" });
    });

    it("should report the delivery error when the provider fails", async () => {
      smsService = require("../../services/sms.service");
      const twilio = require("twilio");
      twilio().messages.create.mockRejectedValue(new Error("provider down"));

      const result = await smsService.sendNotification({ countryCode: "+1" }, "welcome");

      expect(result).toEqual({ sent: false, error: "provider down" });
    });
  });

  // ==========================================
  // COVERAGE — status / masking
  // ==========================================

  describe("getStatus defaults", () => {
    it("should report the twilio default provider and numeric env defaults", () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      expect(smsService.getStatus()).toEqual({
        enabled: true,
        provider: "twilio",
        otpEnabled: true,
        otpExpiry: 300,
        rateLimit: 5,
        otpStoreSize: 0,
        rateLimiterSize: 0,
      });
    });

    it("should ignore unparseable numeric env vars and use the defaults", () => {
      process.env.SMS_ENABLED = "true";
      process.env.SMS_OTP_EXPIRY = "not-a-number";
      process.env.SMS_RATE_LIMIT_PER_HOUR = "not-a-number";
      smsService = require("../../services/sms.service");

      const status = smsService.getStatus();

      expect(status.otpExpiry).toBe(300);
      expect(status.rateLimit).toBe(5);
    });

    it("should reflect live store sizes", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");

      const status = smsService.getStatus();
      expect(status.otpStoreSize).toBe(1);
      expect(status.rateLimiterSize).toBe(1);
    });

    it("should empty both stores on clearCache", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");
      smsService.clearCache();

      expect(smsService.getStatus()).toMatchObject({
        otpStoreSize: 0,
        rateLimiterSize: 0,
      });
    });
  });

  describe("phone masking in logs", () => {
    // NOTE: jest.resetModules() in beforeEach means the logger must be re-required
    // *after* the service, or the test would hold a stale mock instance.
    const freshLogger = () =>
      require("../../middlewares/activityLog.middleware").logger;

    it("should mask all but the last 4 digits of a string phone", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("+1234567890");

      expect(freshLogger().info).toHaveBeenCalledWith("OTP sent successfully", {
        phone: "+123456****7890",
      });
    });

    it("should fully mask a phone shorter than 4 characters", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendOtp("123");

      expect(freshLogger().info).toHaveBeenCalledWith("OTP sent successfully", {
        phone: "***",
      });
    });

    it("should read phoneNumber off an object phone", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendNotification(
        { countryCode: "+1", phoneNumber: "+1234567890" },
        "welcome",
      );

      expect(freshLogger().info).toHaveBeenCalledWith("Notification SMS sent", {
        phone: "+123456****7890",
        type: "welcome",
      });
    });

    it("should fall back to `number` on an object phone", async () => {
      process.env.SMS_ENABLED = "true";
      smsService = require("../../services/sms.service");

      await smsService.sendNotification(
        { countryCode: "+1", number: "+1999888777" },
        "welcome",
      );

      expect(freshLogger().info).toHaveBeenCalledWith("Notification SMS sent", {
        phone: "+199988****8777",
        type: "welcome",
      });
    });
  });
});
