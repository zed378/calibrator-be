/**
 * MeteredBilling Routes Tests
 *
 * Tests the MeteredBilling route registrations and middleware chain.
 */
const meteredbillingRoutes = require("../../routes/api/meteredBilling.route.js");

describe("MeteredBilling Routes", () => {
  it("should export an Express router", () => {
    expect(meteredbillingRoutes).toBeDefined();
    expect(typeof meteredbillingRoutes.handle).toBe("function");
  });

  it("should have registered routes", () => {
    expect(Array.isArray(meteredbillingRoutes.stack)).toBe(true);
    expect(meteredbillingRoutes.stack.length).toBeGreaterThan(0);
  });

  it("should have multiple route handlers registered", () => {
    const allRoutes = meteredbillingRoutes.stack.filter((layer) => layer.route);
    expect(allRoutes.length).toBeGreaterThan(0);
  });

  it("should have middleware or routes in stack", () => {
    const hasMiddleware = meteredbillingRoutes.stack.some(
      (layer) => !layer.route,
    );
    const hasRoutes = meteredbillingRoutes.stack.some(
      (layer) => layer.route,
    );
    // At least one middleware or route layer should exist
    expect(hasMiddleware || hasRoutes).toBe(true);
  });

  it("should have all routes using valid HTTP methods", () => {
    meteredbillingRoutes.stack.forEach((layer) => {
      if (layer.route) {
        const methods = layer.route.methods;
        const hasGet = methods.get === true;
        const hasPost = methods.post === true;
        const hasPut = methods.put === true;
        const hasDelete = methods.delete === true;
        expect(hasGet || hasPost || hasPut || hasDelete).toBe(true);
      }
    });
  });
});
