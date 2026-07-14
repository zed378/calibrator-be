/**
 * Tests for storagePath util
 */
const path = require("path");
const storagePath = require("../../utils/storagePath.util");

describe("storagePath util", () => {
  it("should join a single segment to the storage root", () => {
    const result = storagePath("exports");
    expect(result.endsWith(path.join("exports"))).toBe(true);
  });

  it("should join multiple segments", () => {
    const result = storagePath("exports", "abc", "file.zip");
    expect(result.endsWith(path.join("exports", "abc", "file.zip"))).toBe(true);
  });

  it("should always produce an absolute path", () => {
    expect(path.isAbsolute(storagePath("x"))).toBe(true);
  });

  it("should return a string for the storage root with no segments", () => {
    const result = storagePath();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
