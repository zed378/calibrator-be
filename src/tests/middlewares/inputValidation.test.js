/**
 * Tests for inputValidation middleware (Joi schemas)
 */
const {
  registerValidation,
  loginValidation,
  verifyOtpValidation,
  resendOtpValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
} = require("../../middlewares/inputValidation.middleware");

describe("inputValidation schemas", () => {
  // ================================================================
  // registerValidation
  // ================================================================
  describe("registerValidation", () => {
    const validData = {
      firstName: "John",
      lastName: "Doe",
      username: "johndoe",
      email: "john@example.com",
      password: "Password1",
    };

    it("should validate correct registration data", () => {
      const { error } = registerValidation.validate(validData);
      expect(error).toBeUndefined();
    });

    it("should reject missing firstName", () => {
      const { error } = registerValidation.validate({ ...validData, firstName: undefined });
      expect(error).toBeDefined();
    });

    it("should reject short firstName", () => {
      const { error } = registerValidation.validate({ ...validData, firstName: "J" });
      expect(error).toBeDefined();
    });

    it("should reject missing email", () => {
      const { error } = registerValidation.validate({ ...validData, email: undefined });
      expect(error).toBeDefined();
    });

    it("should reject invalid email", () => {
      const { error } = registerValidation.validate({ ...validData, email: "not-an-email" });
      expect(error).toBeDefined();
    });

    it("should reject weak password (no uppercase)", () => {
      const { error } = registerValidation.validate({ ...validData, password: "password1" });
      expect(error).toBeDefined();
    });

    it("should reject weak password (no number)", () => {
      const { error } = registerValidation.validate({ ...validData, password: "Password" });
      expect(error).toBeDefined();
    });

    it("should reject short password", () => {
      const { error } = registerValidation.validate({ ...validData, password: "Pass1" });
      expect(error).toBeDefined();
    });

    it("should allow empty lastName", () => {
      const { error } = registerValidation.validate({ ...validData, lastName: "" });
      expect(error).toBeUndefined();
    });

    it("should allow null lastName", () => {
      const { error } = registerValidation.validate({ ...validData, lastName: null });
      expect(error).toBeUndefined();
    });

    it("should reject non-alphanumeric username", () => {
      const { error } = registerValidation.validate({ ...validData, username: "john doe!" });
      expect(error).toBeDefined();
    });

    it("should reject short username", () => {
      const { error } = registerValidation.validate({ ...validData, username: "jd" });
      expect(error).toBeDefined();
    });
  });

  // ================================================================
  // loginValidation
  // ================================================================
  describe("loginValidation", () => {
    it("should validate login with email", () => {
      const { error } = loginValidation.validate({ user: "user@test.com", password: "pass123" });
      expect(error).toBeUndefined();
    });

    it("should validate login with username", () => {
      const { error } = loginValidation.validate({ user: "johndoe", password: "pass123" });
      expect(error).toBeUndefined();
    });

    it("should reject missing user", () => {
      const { error } = loginValidation.validate({ password: "pass123" });
      expect(error).toBeDefined();
    });

    it("should reject missing password", () => {
      const { error } = loginValidation.validate({ user: "test@test.com" });
      expect(error).toBeDefined();
    });
  });

  // ================================================================
  // verifyOtpValidation
  // ================================================================
  describe("verifyOtpValidation", () => {
    it("should validate correct OTP", () => {
      const { error } = verifyOtpValidation.validate({ email: "test@test.com", otp: "123456" });
      expect(error).toBeUndefined();
    });

    it("should reject non-numeric OTP", () => {
      const { error } = verifyOtpValidation.validate({ email: "test@test.com", otp: "abcdef" });
      expect(error).toBeDefined();
    });

    it("should reject short OTP", () => {
      const { error } = verifyOtpValidation.validate({ email: "test@test.com", otp: "123" });
      expect(error).toBeDefined();
    });
  });

  // ================================================================
  // resendOtpValidation
  // ================================================================
  describe("resendOtpValidation", () => {
    it("should validate correct email", () => {
      const { error } = resendOtpValidation.validate({ email: "test@test.com" });
      expect(error).toBeUndefined();
    });

    it("should reject invalid email", () => {
      const { error } = resendOtpValidation.validate({ email: "invalid" });
      expect(error).toBeDefined();
    });
  });

  // ================================================================
  // forgotPasswordValidation
  // ================================================================
  describe("forgotPasswordValidation", () => {
    it("should validate correct email", () => {
      const { error } = forgotPasswordValidation.validate({ email: "test@test.com" });
      expect(error).toBeUndefined();
    });

    it("should reject missing email", () => {
      const { error } = forgotPasswordValidation.validate({});
      expect(error).toBeDefined();
    });
  });

  // ================================================================
  // resetPasswordValidation
  // ================================================================
  describe("resetPasswordValidation", () => {
    it("should validate correct reset data", () => {
      const { error } = resetPasswordValidation.validate({
        email: "test@test.com",
        otp: "123456",
        password: "NewPassword1",
      });
      expect(error).toBeUndefined();
    });

    it("should reject missing OTP", () => {
      const { error } = resetPasswordValidation.validate({
        email: "test@test.com",
        password: "NewPassword1",
      });
      expect(error).toBeDefined();
    });

    it("should reject short password", () => {
      const { error } = resetPasswordValidation.validate({
        email: "test@test.com",
        otp: "123456",
        password: "short",
      });
      expect(error).toBeDefined();
    });
  });

  // ================================================================
  // changePasswordValidation
  // ================================================================
  describe("changePasswordValidation", () => {
    it("should validate correct change password data", () => {
      const { error } = changePasswordValidation.validate({
        oldPassword: "OldPass123",
        newPassword: "NewPass123",
        confirmPassword: "NewPass123",
      });
      expect(error).toBeUndefined();
    });

    it("should reject mismatched passwords", () => {
      const { error } = changePasswordValidation.validate({
        oldPassword: "OldPass123",
        newPassword: "NewPass123",
        confirmPassword: "DifferentPass123",
      });
      expect(error).toBeDefined();
    });

    it("should reject missing oldPassword", () => {
      const { error } = changePasswordValidation.validate({
        newPassword: "NewPass123",
        confirmPassword: "NewPass123",
      });
      expect(error).toBeDefined();
    });

    it("should reject weak newPassword", () => {
      const { error } = changePasswordValidation.validate({
        oldPassword: "OldPass123",
        newPassword: "weak",
        confirmPassword: "weak",
      });
      expect(error).toBeDefined();
    });
  });
});
