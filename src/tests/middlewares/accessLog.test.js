/**
 * Tests for accessLog middleware
 */
jest.mock("rotating-file-stream", () => ({
  createStream: jest.fn().mockReturnValue("mock-stream"),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

const { accessLog, errorLog } = require("../../middlewares/accessLog.middleware");

describe("accessLog middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      url: "/api/v1/test",
      originalUrl: "/api/v1/test",
      method: "GET",
      ip: "127.0.0.1",
      user: { id: "user-123" },
    };
    res = {
      statusCode: 200,
    };
    next = jest.fn();
  });

  it("should be defined as middleware functions", () => {
    expect(typeof accessLog).toBe("function");
    expect(typeof errorLog).toBe("function");
  });
});
