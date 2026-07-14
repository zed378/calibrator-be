/**
 * Tests for controllerWrapper utility
 */

const { asyncHandler } = require("../../utils/controllerWrapper.util");

describe("asyncHandler", () => {
  it("should catch async errors and pass to express error handler", async () => {
    const mockFn = asyncHandler(async (req, res) => {
      throw new Error("Test error");
    });

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await mockFn(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.message).toBe("Test error");
    expect(error.status).toBe(500);
  });

  it("should pass successful response to next normally", async () => {
    const mockFn = asyncHandler(async (req, res) => {
      return { success: true };
    });

    const req = {};
    const res = {};
    const next = jest.fn();

    await mockFn(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("should handle sync errors", async () => {
    const mockFn = asyncHandler(async (req, res) => {
      throw new Error("Sync error");
    });

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await mockFn(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.message).toBe("Sync error");
  });

  it("should handle successful async operations", async () => {
    const mockFn = asyncHandler(async (req, res) => {
      return { data: "test" };
    });

    const req = {};
    const res = {};
    const next = jest.fn();

    await mockFn(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});
