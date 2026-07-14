/**
 * Tests for errorHandlers middleware
 */

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock("../../utils/fileValidation.util", () => ({
  sanitizeError: jest.fn((err, isProduction) => ({
    message: isProduction ? "Internal server error" : err.message,
    code: err.code || "INTERNAL_ERROR",
  })),
}));

const { logger } = require("../../middlewares/activityLog.middleware");
const { sanitizeError } = require("../../utils/fileValidation.util");
const { errorHandler } = require("../../middlewares/errorHandlers.middleware");

describe("errorHandlers", () => {
  let req;
  let res;
  let jsonCalls;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonCalls = [];

    req = {
      requestId: "req-123",
      method: "GET",
      originalUrl: "/api/test",
      ip: "127.0.0.1",
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((data) => {
        jsonCalls.push(data);
        return res;
      }),
    };
  });

  describe("errorHandler", () => {
    it("should return 500 for errors without status", () => {
      const err = new Error("Unknown error");

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(logger.error).toHaveBeenCalled();
    });

    it("should return the error status code", () => {
      const err = new Error("Bad request");
      err.status = 400;

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should include requestId in response", () => {
      const err = new Error("Test error");
      req.requestId = "custom-req-id";

      errorHandler(err, req, res, jest.fn());

      expect(jsonCalls[0]).toHaveProperty("requestId", "custom-req-id");
    });

    it("should use 'unknown' when no requestId", () => {
      const err = new Error("Test error");
      req.requestId = undefined;

      errorHandler(err, req, res, jest.fn());

      expect(jsonCalls[0].requestId).toBe("unknown");
    });

    it("should sanitize error in production", () => {
      process.env.NODE_ENV = "production";
      const err = new Error("Database connection failed");
      err.code = "DB_CONN_ERROR";

      errorHandler(err, req, res, jest.fn());

      expect(sanitizeError).toHaveBeenCalledWith(err, true);
      expect(jsonCalls[0].message).toBe("Internal server error");

      process.env.NODE_ENV = "test";
    });

    it("should not sanitize error in development", () => {
      process.env.NODE_ENV = "development";
      const err = new Error("Sensitive error");

      errorHandler(err, req, res, jest.fn());

      expect(sanitizeError).toHaveBeenCalledWith(err, false);

      process.env.NODE_ENV = "test";
    });

    it("should log error details", () => {
      const err = new Error("Test error");
      err.stack = "Error: Test error\n    at line 1";

      errorHandler(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalledWith("Test error", {
        requestId: "req-123",
        statusCode: 500,
        method: "GET",
        url: "/api/test",
        ip: "127.0.0.1",
        stack: err.stack,
      });
    });

    it("should handle AppError with status", () => {
      const err = new Error("Not found");
      err.status = 404;
      err.code = "NOT_FOUND";

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should handle null error message", () => {
      const err = { status: 500 };

      errorHandler(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle error with empty message", () => {
      const err = new Error("");
      err.status = 500;

      errorHandler(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalledWith(
        "Internal server error",
        expect.any(Object),
      );
    });

    it("should handle error without stack property", () => {
      const err = new Error("No stack error");
      err.status = 500;
      err.stack = undefined;

      errorHandler(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle error with status 401", () => {
      const err = new Error("Unauthorized");
      err.status = 401;
      err.code = "UNAUTHORIZED";

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should handle error with status 403", () => {
      const err = new Error("Forbidden");
      err.status = 403;
      err.code = "FORBIDDEN";

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should handle error with status 422", () => {
      const err = new Error("Validation failed");
      err.status = 422;
      err.code = "VALIDATION_ERROR";

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(422);
    });

    it("should handle error with status 503", () => {
      const err = new Error("Service unavailable");
      err.status = 503;
      err.code = "SERVICE_UNAVAILABLE";

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should use default requestId when null", () => {
      const err = new Error("Test error");
      req.requestId = null;

      errorHandler(err, req, res, jest.fn());

      expect(jsonCalls[0].requestId).toBe("unknown");
    });

    it("should include all request details in log", () => {
      const err = new Error("Detailed error");
      err.status = 500;
      err.stack = "Error: Detailed error\n    at test.js:1";

      errorHandler(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalledWith("Detailed error", {
        requestId: "req-123",
        statusCode: 500,
        method: "GET",
        url: "/api/test",
        ip: "127.0.0.1",
        stack: "Error: Detailed error\n    at test.js:1",
      });
    });

    it("should return sanitized error data in response", () => {
      const err = new Error("Test error");
      err.code = "TEST_CODE";

      errorHandler(err, req, res, jest.fn());

      expect(jsonCalls[0]).toHaveProperty("message");
      expect(jsonCalls[0]).toHaveProperty("code");
      expect(jsonCalls[0]).toHaveProperty("requestId");
    });

    it("should handle error with additional properties", () => {
      const err = new Error("Extended error");
      err.status = 500;
      err.details = { field: "email", reason: "invalid" };

      errorHandler(err, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
