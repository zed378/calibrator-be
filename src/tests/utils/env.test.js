/**
 * Tests for env.util
 */
describe("env.util", () => {
  it("should not throw when loaded", () => {
    expect(() => require("../../utils/env.util")).not.toThrow();
  });
});
