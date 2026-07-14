/**
 * SCIM Routes Tests (full)
 *
 * Tests all 14 SCIM route registrations (Users + Groups) and middleware chain.
 * Endpoints:
 *   Users — GET, GET/:id, POST, PUT/:id, PATCH/:id, DELETE/:id (6)
 *   Groups — GET, GET/:id, POST, PUT/:id, PATCH/:id, DELETE/:id (6)
 *   Plus router.use() middleware layers (scimAuthShim, requireApiKeyOrAdmin)
 */
const scimRoutes = require("../../routes/api/scim.route");

describe("SCIM Routes (full coverage)", () => {
  it("should export an Express router", () => {
    expect(scimRoutes).toBeDefined();
    expect(typeof scimRoutes.handle).toBe("function");
  });

  it("should have registered routes", () => {
    expect(Array.isArray(scimRoutes.stack)).toBe(true);
    expect(scimRoutes.stack.length).toBeGreaterThan(0);
  });

  it("should have middleware layers (router.use)", () => {
    const middlewareLayers = scimRoutes.stack.filter(
      (layer) => !layer.route,
    );
    expect(middlewareLayers.length).toBeGreaterThan(0);
  });

  it("should have route handlers registered", () => {
    const allRoutes = scimRoutes.stack.filter((layer) => layer.route);
    expect(allRoutes.length).toBe(12);
  });

  // --- Users: GET /Users ---
  it("should have GET /Users route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Users" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(route).toBeDefined();
  });

  // --- Users: GET /Users/:id ---
  it("should have GET /Users/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Users/:id" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(route).toBeDefined();
  });

  // --- Users: POST /Users ---
  it("should have POST /Users route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Users" &&
        layer.route.methods &&
        layer.route.methods.post,
    );
    expect(route).toBeDefined();
  });

  // --- Users: PUT /Users/:id ---
  it("should have PUT /Users/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Users/:id" &&
        layer.route.methods &&
        layer.route.methods.put,
    );
    expect(route).toBeDefined();
  });

  // --- Users: PATCH /Users/:id ---
  it("should have PATCH /Users/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Users/:id" &&
        layer.route.methods &&
        layer.route.methods.patch,
    );
    expect(route).toBeDefined();
  });

  // --- Users: DELETE /Users/:id ---
  it("should have DELETE /Users/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Users/:id" &&
        layer.route.methods &&
        layer.route.methods.delete,
    );
    expect(route).toBeDefined();
  });

  // --- Groups: GET /Groups ---
  it("should have GET /Groups route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Groups" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(route).toBeDefined();
  });

  // --- Groups: GET /Groups/:id ---
  it("should have GET /Groups/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Groups/:id" &&
        layer.route.methods &&
        layer.route.methods.get,
    );
    expect(route).toBeDefined();
  });

  // --- Groups: POST /Groups ---
  it("should have POST /Groups route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Groups" &&
        layer.route.methods &&
        layer.route.methods.post,
    );
    expect(route).toBeDefined();
  });

  // --- Groups: PUT /Groups/:id ---
  it("should have PUT /Groups/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Groups/:id" &&
        layer.route.methods &&
        layer.route.methods.put,
    );
    expect(route).toBeDefined();
  });

  // --- Groups: PATCH /Groups/:id ---
  it("should have PATCH /Groups/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Groups/:id" &&
        layer.route.methods &&
        layer.route.methods.patch,
    );
    expect(route).toBeDefined();
  });

  // --- Groups: DELETE /Groups/:id ---
  it("should have DELETE /Groups/:id route", () => {
    const route = scimRoutes.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/Groups/:id" &&
        layer.route.methods &&
        layer.route.methods.delete,
    );
    expect(route).toBeDefined();
  });

  it("should have all routes using valid HTTP methods", () => {
    scimRoutes.stack.forEach((layer) => {
      if (layer.route) {
        const methods = layer.route.methods;
        const validMethods = ["get", "post", "put", "patch", "delete"];
        const hasValidMethod = validMethods.some((m) => methods[m] === true);
        expect(hasValidMethod).toBe(true);
      }
    });
  });
});
