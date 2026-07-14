/**
 * Tests for Auth Controller
 */

// Mock services FIRST (required for --experimental-vm-modules hoisting)
jest.mock("../../services/auth.service", () => ({
  registerUser: jest.fn(),
  activateAccount: jest.fn(),
  loginUser: jest.fn(),
  logoutSession: jest.fn(),
  logoutAllUserSessions: jest.fn(),
  requestOTP: jest.fn(),
  processResetPassword: jest.fn(),
  verifyOtp: jest.fn(),
  verifyEmail: jest.fn(),
  passIsValid: jest.fn(),
  refreshUserToken: jest.fn(),
  verifyUserSession: jest.fn(),
  justUpdatePassword: jest.fn(),
}));

// Mock response helper FIRST
jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
  login: jest.fn(),
  badRequest: jest.fn(),
}));

const authController = require("../../controllers/auth.controller");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const authService = require("../../services/auth.service");
const { success, error, login, badRequest } = require("../../utils/response.util");

describe("authController", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      query: {},
      headers: {},
      ip: "127.0.0.1",
      user: { id: "user-1", tenantId: "tenant-1" },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {},
    };

    success.mockImplementation((response, data, message) => {
      response.json({ success: true, data, message });
    });
    error.mockImplementation((response, message, status) => {
      response.status(status).json({ success: false, message });
    });
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      const mockUserData = {
        username: "testuser",
        email: "test@example.com",
        password: "TestPass123",
      };

      req.body = mockUserData;

      authService.registerUser.mockResolvedValue({
        success: true,
        status: 201,
        message:
          "Registration successful. Please check your email to activate your account.",
        data: { email: "test@example.com" },
      });

      req.headers.origin = "http://localhost:3000";

      await authController.register(req, res);

      expect(authService.registerUser).toHaveBeenCalledWith(mockUserData, "http://localhost:3000");
      expect(success).toHaveBeenCalled();
    });

    it("should return 400 when registration fails", async () => {
      req.body = {
        email: "existing@example.com",
        password: "TestPass123",
      };

      authService.registerUser.mockRejectedValue(new Error("Email already registered"));

      await authController.register(req, res);

      expect(error).toHaveBeenCalled();
    });
  });

  describe("activation", () => {
    it("should activate user account successfully", async () => {
      req.query = { token: "activation-token-123" };

      authService.activateAccount.mockResolvedValue({
        success: true,
        status: 200,
        message: "Account activated successfully",
      });

      await authController.activation(req, res);

      expect(authService.activateAccount).toHaveBeenCalledWith(
        "activation-token-123",
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 400 when activation token is missing", async () => {
      req.query = {};

      await authController.activation(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should return 400 when activation token is invalid", async () => {
      req.query = { token: "invalid-token" };

      authService.activateAccount.mockRejectedValue(new Error("Invalid or expired activation token"));

      await authController.activation(req, res);

      expect(error).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should login successfully with valid credentials", async () => {
      const mockCredentials = {
        email: "test@example.com",
        password: "TestPass123",
      };

      req.body = mockCredentials;

      authService.loginUser.mockResolvedValue({
        success: true,
        status: 200,
        message: "Login successful",
        data: {
          user: { id: "user-1", email: "test@example.com" },
          token: "access-token",
          session: { id: "session-1" },
        },
      });

      req.headers["user-agent"] = "jest-agent";

      await authController.login(req, res);

      expect(authService.loginUser).toHaveBeenCalledWith({
        ...mockCredentials,
        ip: "127.0.0.1",
        userAgent: "jest-agent",
      });
      expect(login).toHaveBeenCalled();
    });

    it("should return 401 with invalid credentials", async () => {
      req.body = {
        email: "wrong@example.com",
        password: "wrongpassword",
      };

      authService.loginUser.mockRejectedValue(new Error("Invalid credentials"));

      await authController.login(req, res);

      expect(error).toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("should logout successfully", async () => {
      authService.logoutSession.mockResolvedValue({
        success: true,
        status: 200,
        message: "Logout successful",
      });

      await authController.logout(req, res);

      expect(authService.logoutSession).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });
  });

  describe("logoutAll", () => {
    it("should logout all sessions successfully", async () => {
      req.user = { id: "user-1" };

      authService.logoutAllUserSessions.mockResolvedValue({
        success: true,
        status: 200,
        message: "All sessions revoked successfully",
      });

      await authController.logoutAll(req, res);

      expect(authService.logoutAllUserSessions).toHaveBeenCalledWith("user-1");
      expect(success).toHaveBeenCalled();
    });
  });

  describe("sendOTP", () => {
    it("should send OTP successfully", async () => {
      req.body = { email: "test@example.com" };

      authService.requestOTP.mockResolvedValue({
        success: true,
        status: 200,
        message: "If the account exists, OTP has been sent",
      });

      await authController.sendOTP(req, res);

      expect(authService.requestOTP).toHaveBeenCalledWith(req.body);
      expect(success).toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("should reset password successfully", async () => {
      req.body = {
        email: "test@example.com",
        otp: "123456",
        newPassword: "NewPass123",
      };

      authService.processResetPassword.mockResolvedValue({
        success: true,
        status: 200,
        message: "Password reset successful",
      });

      await authController.resetPassword(req, res);

      expect(authService.processResetPassword).toHaveBeenCalledWith(req.body);
      expect(success).toHaveBeenCalled();
    });
  });

  describe("verify", () => {
    it("should verify token successfully", async () => {
      req.user = { id: "user-1", email: "test@example.com" };
      req.session = { id: "session-1" };

      authService.verifyUserSession.mockResolvedValue({
        success: true,
        status: 200,
        data: { user: { id: "user-1" } },
      });

      await authController.verify(req, res);

      expect(success).toHaveBeenCalled();
    });
  });

  describe("justUpdatePassword", () => {
    it("should update password successfully", async () => {
      req.user = { id: "user-1" };
      req.body = { newPassword: "NewPass123" };

      authService.justUpdatePassword.mockResolvedValue({
        success: true,
        status: 200,
        message: "Password updated successfully",
      });

      await authController.justUpdatePassword(req, res);

      expect(authService.justUpdatePassword).toHaveBeenCalledWith("user-1", "NewPass123");
      expect(success).toHaveBeenCalled();
    });
  });

  describe("passIsValid", () => {
    it("should validate password successfully", async () => {
      req.user = { id: "user-1" };
      req.body = { password: "TestPass123" };

      authService.passIsValid.mockResolvedValue({
        success: true,
        status: 200,
        data: { isValid: true },
        message: "Password is valid",
      });

      await authController.passIsValid(req, res);

      expect(authService.passIsValid).toHaveBeenCalledWith("user-1", "TestPass123");
      expect(success).toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("should refresh token successfully", async () => {
      req.body = { refreshToken: "refresh-token-123", sessionId: "session-1" };
      req.ip = "127.0.0.1";
      req.headers["user-agent"] = "jest-agent";

      authService.refreshUserToken.mockResolvedValue({
        success: true,
        status: 200,
        data: { token: "new-access-token" },
        message: "Token refreshed successfully",
      });

      await authController.refresh(req, res);

      expect(authService.refreshUserToken).toHaveBeenCalledWith(
        "refresh-token-123",
        "session-1",
        "127.0.0.1",
        "jest-agent",
      );
      expect(success).toHaveBeenCalled();
    });

    it("should refresh token successfully without sessionId", async () => {
      req.body = { refreshToken: "refresh-token-123" };
      req.ip = "127.0.0.1";
      req.headers["user-agent"] = "jest-agent";

      authService.refreshUserToken.mockResolvedValue({
        success: true,
        status: 200,
        data: { token: "new-access-token" },
        message: "Token refreshed successfully",
      });

      await authController.refresh(req, res);

      expect(authService.refreshUserToken).toHaveBeenCalledWith(
        "refresh-token-123",
        null,
        "127.0.0.1",
        "jest-agent",
      );
      expect(success).toHaveBeenCalled();
    });

    it("should return 400 when refresh token is missing", async () => {
      req.body = {};

      await authController.refresh(req, res);

      expect(error).toHaveBeenCalled();
    });
  });
});
