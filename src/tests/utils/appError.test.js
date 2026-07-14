/**
 * Tests for appError utility
 */

const { AppError, formatErrors } = require("../../utils/appError.util");

describe("AppError", () => {
  it("should create an AppError with status and message", () => {
    const err = new AppError(400, "Bad request");

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Bad request");
    expect(err.isOperational).toBe(true);
  });

  it("should default to 500 status", () => {
    const err = new AppError();

    expect(err.status).toBe(500);
  });

  it("should handle various HTTP status codes", () => {
    const codes = [400, 401, 403, 404, 409, 422, 429, 500, 503];

    for (const code of codes) {
      const err = new AppError(code, "Error message");
      expect(err.status).toBe(code);
    }
  });
});

describe("formatErrors", () => {
  it("should format a single error", () => {
    const details = [
      {
        message: "Email is required",
        path: ["email"],
        type: "any.required",
      },
    ];

    const result = formatErrors(details);

    expect(result).toBe("Email is required");
  });

  it("should format multiple errors", () => {
    const details = [
      { message: "Email is required", path: ["email"], type: "any.required" },
      {
        message: "Password is too short",
        path: ["password"],
        type: "string.min",
      },
    ];

    const result = formatErrors(details);

    expect(result).toContain("Email is required");
    expect(result).toContain("Password is too short");
  });

  it("should handle empty array", () => {
    const result = formatErrors([]);

    expect(result).toBe("");
  });

  it("should handle null input", () => {
    const result = formatErrors(null);

    expect(result).toBe("");
  });

  it("should handle undefined input", () => {
    const result = formatErrors(undefined);

    expect(result).toBe("");
  });
});
