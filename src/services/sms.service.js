/**
 * SMS Provider Service
 *
 * Multi-provider SMS service supporting Twilio, AWS SNS, and generic HTTP providers.
 * Provides OTP delivery, notifications, and transactional messaging.
 *
 * Usage:
 *   const { sendOtp, sendNotification } = require('./services/sms.service');
 *   await sendOtp(phoneNumber, code);
 */

const axios = require("axios");
const crypto = require("crypto");
const { logger } = require("../middlewares/activityLog.middleware");
const { AppError } = require("../utils/appError.util");
const { withCircuitBreaker } = require("../utils/circuitBreaker.util");

// ==========================================
// CONFIGURATION
// ==========================================

const SMS_PROVIDER = (process.env.SMS_PROVIDER || "twilio").toLowerCase();
const SMS_ENABLED = process.env.SMS_ENABLED === "true";
const SMS_OTP_ENABLED = process.env.SMS_OTP_ENABLED !== "false";
const SMS_OTP_LENGTH = parseInt(process.env.SMS_OTP_LENGTH) || 6;
const SMS_OTP_EXPIRY = parseInt(process.env.SMS_OTP_EXPIRY) || 300; // 5 minutes
const SMS_OTP_MAX_ATTEMPTS = parseInt(process.env.SMS_OTP_MAX_ATTEMPTS) || 3;
const SMS_RATE_LIMIT_PER_HOUR =
  parseInt(process.env.SMS_RATE_LIMIT_PER_HOUR) || 5;

// Twilio config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// AWS SNS config
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_SNS_PHONE = process.env.AWS_SNS_PHONE;

// Generic HTTP provider config
const SMS_HTTP_URL = process.env.SMS_HTTP_URL;
const SMS_HTTP_API_KEY = process.env.SMS_HTTP_API_KEY;
const SMS_HTTP_FROM = process.env.SMS_HTTP_FROM;

// ==========================================
// OTP STORAGE (in-memory, use Redis in production)
// ==========================================

class OtpStore {
  constructor() {
    this._store = new Map();
  }

  get(phone) {
    const entry = this._store.get(phone);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this._store.delete(phone);
      return null;
    }

    return entry;
  }

  set(phone, code) {
    this._store.set(phone, {
      code,
      createdAt: Date.now(),
      expiresAt: Date.now() + SMS_OTP_EXPIRY * 1000,
      attempts: 0,
      maxAttempts: SMS_OTP_MAX_ATTEMPTS,
    });
  }

  incrementAttempts(phone) {
    const entry = this._store.get(phone);
    if (entry) {
      entry.attempts++;
    }
  }

  hasMaxAttempts(phone) {
    const entry = this._store.get(phone);
    return entry && entry.attempts >= entry.maxAttempts;
  }

  delete(phone) {
    this._store.delete(phone);
  }

  clear() {
    this._store.clear();
  }

  size() {
    return this._store.size;
  }
}

const otpStore = new OtpStore();

// ==========================================
// RATE LIMITER (in-memory, use Redis in production)
// ==========================================

class SmsRateLimiter {
  constructor(maxPerHour) {
    this._maxPerHour = maxPerHour;
    this._requests = new Map();
  }

  canSend(phone) {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;

    let requests = this._requests.get(phone) || [];
    requests = requests.filter((ts) => ts > hourAgo);

    if (requests.length >= this._maxPerHour) {
      return false;
    }

    requests.push(now);
    this._requests.set(phone, requests);
    return true;
  }

  clear() {
    this._requests.clear();
  }

  size() {
    return this._requests.size;
  }
}

const rateLimiter = new SmsRateLimiter(SMS_RATE_LIMIT_PER_HOUR);

// ==========================================
// OTP GENERATION & VALIDATION
// ==========================================

/**
 * Generate a cryptographically secure OTP code
 */
function generateOtp() {
  const min = Math.pow(10, SMS_OTP_LENGTH - 1);
  const max = Math.pow(10, SMS_OTP_LENGTH) - 1;

  // Use crypto for secure random number
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  const code = min + (randomValue % (max - min + 1));

  return code.toString().padStart(SMS_OTP_LENGTH, "0");
}

/**
 * Send OTP via SMS
 * @param {string} phone - Phone number in E.164 format
 * @returns {Promise<{sent: boolean, expiresAt: number}>}
 */
exports.sendOtp = async (phone) => {
  if (!SMS_ENABLED) {
    logger.debug("SMS service disabled, OTP not sent", { phone });
    return { sent: false, reason: "SMS disabled" };
  }

  if (!SMS_OTP_ENABLED) {
    return { sent: false, reason: "OTP via SMS is disabled" };
  }

  if (!phone) {
    throw new AppError(400, "Phone number is required");
  }

  // Check rate limit
  if (!rateLimiter.canSend(phone)) {
    logger.warn("SMS rate limit exceeded", { phone });
    throw new AppError(429, "Too many SMS requests. Please try again later.");
  }

  // Check if OTP has max attempts
  if (otpStore.hasMaxAttempts(phone)) {
    logger.warn("OTP max attempts reached", { phone });
    throw new AppError(
      429,
      "Too many failed attempts. Please request a new OTP.",
    );
  }

  const code = generateOtp();
  otpStore.set(phone, code);

  try {
    await withCircuitBreaker("sms", () => deliverSms(phone, code));
    logger.info("OTP sent successfully", { phone: maskPhone(phone) });
    return {
      sent: true,
      expiresAt: Date.now() + SMS_OTP_EXPIRY * 1000,
    };
  } catch (err) {
    logger.error("Failed to send OTP SMS", {
      phone: maskPhone(phone),
      error: err.message,
    });
    throw new AppError(500, "Failed to send SMS. Please try again later.");
  }
};

/**
 * Verify OTP code
 * @param {string} phone - Phone number
 * @param {string} code - OTP code to verify
 * @returns {Promise<{valid: boolean, message: string}>}
 */
exports.verifyOtp = async (phone, code) => {
  if (!phone || !code) {
    return { valid: false, message: "Phone and code are required" };
  }

  const entry = otpStore.get(phone);
  if (!entry) {
    return { valid: false, message: "OTP expired or not found" };
  }

  if (otpStore.hasMaxAttempts(phone)) {
    otpStore.delete(phone);
    return {
      valid: false,
      message: "Too many failed attempts. Request a new OTP.",
    };
  }

  if (entry.code !== code.toString()) {
    otpStore.incrementAttempts(phone);
    const remaining = entry.maxAttempts - entry.attempts - 1;
    logger.warn("Invalid OTP", {
      phone: maskPhone(phone),
      attempts: entry.attempts,
      remaining,
    });
    return {
      valid: false,
      message: `Invalid OTP. ${remaining} attempts remaining.`,
    };
  }

  // Valid OTP
  otpStore.delete(phone);
  logger.info("OTP verified successfully", { phone: maskPhone(phone) });
  return { valid: true, message: "OTP verified successfully" };
};

// ==========================================
// SMS DELIVERY PROVIDERS
// ==========================================

/**
 * Deliver SMS via selected provider
 * @param {string} phone - Recipient phone number
 * @param {string} message - Message body
 */
async function deliverSms(phone, message) {
  switch (SMS_PROVIDER) {
    case "twilio":
      return deliverViaTwilio(phone, message);
    case "sns":
    case "aws":
    case "aws-sns":
      return deliverViaAwsSns(phone, message);
    case "http":
    case "generic":
      return deliverViaHttp(phone, message);
    default:
      throw new AppError(500, `Unknown SMS provider: ${SMS_PROVIDER}`);
  }
}

/**
 * Send via Twilio
 */
async function deliverViaTwilio(phone, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    throw new AppError(500, "Twilio credentials not configured");
  }

  const twilio = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  await twilio.messages.create({
    body: message,
    from: TWILIO_PHONE_NUMBER,
    to: phone,
  });
}

/**
 * Send via AWS SNS
 */
async function deliverViaAwsSns(phone, message) {
  // Lazy load AWS SDK
  const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

  const sns = new SNSClient({
    region: AWS_REGION,
    credentials:
      AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  await sns.send(
    new PublishCommand({
      PhoneNumber: phone,
      Message: message,
    }),
  );
}

/**
 * Send via generic HTTP provider
 */
async function deliverViaHttp(phone, message) {
  if (!SMS_HTTP_URL) {
    throw new AppError(500, "HTTP SMS endpoint not configured");
  }

  const response = await axios.post(
    SMS_HTTP_URL,
    {
      to: phone,
      from: SMS_HTTP_FROM,
      message,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SMS_HTTP_API_KEY}`,
      },
      timeout: 15000,
    },
  );

  return response.data;
}

// ==========================================
// NOTIFICATION MESSAGES
// ==========================================

/**
 * Send a notification SMS
 * @param {string} phone - Recipient phone
 * @param {string} type - Message type (welcome, alert, reminder, etc.)
 * @param {Object} data - Template data
 */
exports.sendNotification = async (phone, type, data = {}) => {
  if (!SMS_ENABLED) {
    logger.debug("SMS service disabled, notification not sent", {
      phone,
      type,
    });
    return { sent: false, reason: "SMS disabled" };
  }

  const templates = getNotificationTemplate(type, data);

  if (!templates[phone?.countryCode]) {
    logger.warn("No SMS template for country", { phone, type });
    return { sent: false, reason: "No template available" };
  }

  try {
    await withCircuitBreaker("sms", () =>
      deliverSms(phone, templates[phone.countryCode]),
    );
    logger.info("Notification SMS sent", { phone: maskPhone(phone), type });
    return { sent: true };
  } catch (err) {
    logger.error("Failed to send notification SMS", {
      phone: maskPhone(phone),
      type,
      error: err.message,
    });
    return { sent: false, error: err.message };
  }
};

/**
 * Get notification message templates
 */
function getNotificationTemplate(type, data) {
  const templates = {
    "welcome": `Welcome to Callibrator! ${data.link ? `Get started: ${data.link}` : ""}`,
    "alert": `Callibrator alert: ${data.message || "An alert has been triggered."}`,
    "reminder": `Callibrator reminder: ${data.message || "Upcoming calibration due."}`,
    "password-reset": `Your password reset code is: ${data.code || ""}. Valid for 15 minutes.`,
    "verification": `Your verification code is: ${data.code || ""}. Valid for 5 minutes.`,
  };

  const msg = templates[type] || templates.alert;
  return {
    "+1": msg,
    "+44": msg,
    "+62": msg,
  };
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Mask phone number for logging
 */
function maskPhone(phone) {
  const str = typeof phone === "string" ? phone : (phone?.phoneNumber || phone?.number || String(phone || ""));
  if (!str || str.length < 4) return "***";
  return str.slice(0, -4) + "****" + str.slice(-4);
}

/**
 * Get SMS service status
 */
exports.getStatus = () => {
  return {
    enabled: SMS_ENABLED,
    provider: SMS_PROVIDER,
    otpEnabled: SMS_OTP_ENABLED,
    otpExpiry: SMS_OTP_EXPIRY,
    rateLimit: SMS_RATE_LIMIT_PER_HOUR,
    otpStoreSize: otpStore.size(),
    rateLimiterSize: rateLimiter.size(),
  };
};

/**
 * Clear caches (for testing)
 */
exports.clearCache = () => {
  otpStore.clear();
  rateLimiter.clear();
  logger.info("SMS service caches cleared");
};

/**
 * Check if SMS is configured
 */
exports.isConfigured = () => {
  if (!SMS_ENABLED) return false;

  switch (SMS_PROVIDER) {
    case "twilio":
      return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
    case "sns":
    case "aws":
    case "aws-sns":
      return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
    case "http":
    case "generic":
      return !!SMS_HTTP_URL;
    default:
      return false;
  }
};
