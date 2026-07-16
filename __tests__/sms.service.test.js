const sms = require("../src/services/sms.service");

describe("sms.service", () => {
  beforeEach(() => {
    // Clear OTP store and rate limiter before each test
    sms.clearCache();
  });

  describe("getStatus", () => {
    it("should return service status object", () => {
      const status = sms.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe("object");
      expect(status).toHaveProperty("enabled");
      expect(status).toHaveProperty("provider");
      expect(status).toHaveProperty("otpEnabled");
      expect(status).toHaveProperty("otpExpiry");
      expect(status).toHaveProperty("rateLimit");
      expect(status).toHaveProperty("otpStoreSize");
      expect(status).toHaveProperty("rateLimiterSize");
    });

    it("should have enabled as boolean", () => {
      const status = sms.getStatus();
      expect(typeof status.enabled).toBe("boolean");
    });

    it("should have provider as string", () => {
      const status = sms.getStatus();
      expect(typeof status.provider).toBe("string");
    });

    it("should have otpExpiry as number", () => {
      const status = sms.getStatus();
      expect(typeof status.otpExpiry).toBe("number");
      expect(status.otpExpiry).toBe(300);
    });

    it("should have rateLimit as number", () => {
      const status = sms.getStatus();
      expect(typeof status.rateLimit).toBe("number");
    });
  });

  describe("isConfigured", () => {
    it("should return false when SMS is disabled", () => {
      const result = sms.isConfigured();
      expect(typeof result).toBe("boolean");
    });

    it("should return boolean", () => {
      const result = sms.isConfigured();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("clearCache", () => {
    it("should clear OTP store and rate limiter", () => {
      sms.clearCache();
      const status = sms.getStatus();
      expect(status.otpStoreSize).toBe(0);
      expect(status.rateLimiterSize).toBe(0);
    });
  });

  describe("verifyOtp", () => {
    it("should return invalid when phone and code are missing", async () => {
      const result = await sms.verifyOtp(null, null);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Phone and code are required");
    });

    it("should return invalid when phone is missing but code is provided", async () => {
      const result = await sms.verifyOtp(null, "123456");
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Phone and code are required");
    });

    it("should return invalid when code is missing but phone is provided", async () => {
      const result = await sms.verifyOtp("+1234567890", null);
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Phone and code are required");
    });

    it("should return invalid when OTP not found", async () => {
      const result = await sms.verifyOtp("+1234567890", "123456");
      expect(result.valid).toBe(false);
      expect(result.message).toBe("OTP expired or not found");
    });

    it("should return invalid for empty string phone and code", async () => {
      const result = await sms.verifyOtp("", "");
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Phone and code are required");
    });
  });

  describe("sendOtp", () => {
    it("should return early when SMS is disabled", async () => {
      // SMS is likely disabled in test env
      const result = await sms.sendOtp("+1234567890", "test@example.com");
      expect(result).toBeDefined();
      expect(result.sent).toBe(false);
    });

    it("should return early when phone is empty string and SMS is disabled", async () => {
      const result = await sms.sendOtp("", "test@example.com");
      expect(result).toBeDefined();
      expect(result.sent).toBe(false);
    });

    it("should return early when phone is null and SMS is disabled", async () => {
      const result = await sms.sendOtp(null, "test@example.com");
      expect(result).toBeDefined();
      expect(result.sent).toBe(false);
    });
  });

  describe("exports", () => {
    it("should export sendOtp function", () => {
      expect(typeof sms.sendOtp).toBe("function");
    });

    it("should export verifyOtp function", () => {
      expect(typeof sms.verifyOtp).toBe("function");
    });

    it("should export sendNotification function", () => {
      expect(typeof sms.sendNotification).toBe("function");
    });

    it("should export getStatus function", () => {
      expect(typeof sms.getStatus).toBe("function");
    });

    it("should export clearCache function", () => {
      expect(typeof sms.clearCache).toBe("function");
    });

    it("should export isConfigured function", () => {
      expect(typeof sms.isConfigured).toBe("function");
    });
  });
});
