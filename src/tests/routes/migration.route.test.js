/**
 * Migration Routes Tests
 *
 * Tests the internal migration route registrations and middleware chain.
 * Endpoints: GET /up, GET /down, GET /seeding, GET /unseeding
 */
const migrationRoutes = require("../../routes/internal/migration.route");

describe("Migration Routes", () => {
  it("should export an Express router", () => {
    expect(migrationRoutes).toBeDefined();
    expect(typeof migrationRoutes.handle).toBe("function");
  });

  it("should have registered routes", () => {
    expect(Array.isArray(migrationRoutes.stack)).toBe(true);
    expect(migrationRoutes.stack.length).toBeGreaterThan(0);
  });

  it("should have multiple route handlers registered", () => {
    const allRoutes = migrationRoutes.stack.filter((layer) => layer.route);
    expect(allRoutes.length).toBe(4);
  });

  it("should have GET /up route", () => {
    const routes = migrationRoutes.stack.filter(
      (layer) =>
        layer.route &&
        layer.route.path === "/up" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(routes.length).toBe(1);
  });

  it("should have GET /down route", () => {
    const routes = migrationRoutes.stack.filter(
      (layer) =>
        layer.route &&
        layer.route.path === "/down" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(routes.length).toBe(1);
  });

  it("should have GET /seeding route", () => {
    const routes = migrationRoutes.stack.filter(
      (layer) =>
        layer.route &&
        layer.route.path === "/seeding" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(routes.length).toBe(1);
  });

  it("should have GET /unseeding route", () => {
    const routes = migrationRoutes.stack.filter(
      (layer) =>
        layer.route &&
        layer.route.path === "/unseeding" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(routes.length).toBe(1);
  });

  it("should have middleware or routes in stack", () => {
    const hasMiddleware = migrationRoutes.stack.some(
      (layer) => !layer.route,
    );
    const hasRoutes = migrationRoutes.stack.some(
      (layer) => layer.route,
    );
    expect(hasMiddleware || hasRoutes).toBe(true);
  });

  it("should have all routes using GET method only", () => {
    migrationRoutes.stack.forEach((layer) => {
      if (layer.route) {
        const methods = layer.route.methods;
        expect(methods.get === true).toBe(true);
      }
    });
  });

  it("should have exactly 4 route endpoints", () => {
    const routeCount = migrationRoutes.stack.filter(
      (layer) => layer.route,
    ).length;
    expect(routeCount).toBe(4);
  });
});
