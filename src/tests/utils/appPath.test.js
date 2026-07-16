/**
 * Tests for appPath util
 */
const path = require("path");
const appPath = require("../../utils/appPath.util");

describe("appPath util", () => {
  it("should join a single segment to the app root", () => {
    const result = appPath("uploads");
    expect(result.endsWith(path.join("uploads"))).toBe(true);
    expect(result).toContain("uploads");
  });

  it("should join multiple segments", () => {
    const result = appPath("uploads", "avatars", "pic.png");
    expect(result.endsWith(path.join("uploads", "avatars", "pic.png"))).toBe(true);
  });

  it("should return the app root when given no segments", () => {
    const result = appPath();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should always produce an absolute path", () => {
    expect(path.isAbsolute(appPath("x"))).toBe(true);
  });

  it("should return correct path when packaged", () => {
    jest.resetModules();
    process.pkg = {};
    const originalExecPath = process.execPath;
    process.execPath = "c:\\Program Files\\app\\exec.exe";
    try {
      const appPathPackaged = require("../../utils/appPath.util");
      const result = appPathPackaged("uploads");
      expect(result).toBe(path.join("c:\\Program Files\\app", "uploads"));
    } finally {
      delete process.pkg;
      process.execPath = originalExecPath;
      jest.resetModules();
    }
  });
});
