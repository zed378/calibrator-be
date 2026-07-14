/**
 * User Routes Tests
 *
 * Tests the user route registrations and middleware chain.
 */
const userRoutes = require("../../routes/api/user.route");

describe("User Routes", () => {
  it("should export an Express router", () => {
    expect(userRoutes).toBeDefined();
    expect(typeof userRoutes.handle).toBe("function");
  });

  it("should have registered routes", () => {
    expect(Array.isArray(userRoutes.stack)).toBe(true);
    expect(userRoutes.stack.length).toBeGreaterThan(0);
  });

  it("should have multiple route handlers registered", () => {
    const allRoutes = userRoutes.stack.filter((layer) => layer.route);
    expect(allRoutes.length).toBeGreaterThan(5);
  });

  it("should have GET method routes", () => {
    const getRoutes = userRoutes.stack.filter(
      (layer) => layer.route && layer.route.methods && layer.route.methods.get,
    );
    expect(getRoutes.length).toBeGreaterThan(0);
  });

  it("should have POST method routes", () => {
    const postRoutes = userRoutes.stack.filter(
      (layer) => layer.route && layer.route.methods && layer.route.methods.post,
    );
    expect(postRoutes.length).toBeGreaterThan(3);
  });

  it("should have PATCH method routes", () => {
    const patchRoutes = userRoutes.stack.filter(
      (layer) =>
        layer.route && layer.route.methods && layer.route.methods.patch,
    );
    expect(patchRoutes.length).toBeGreaterThan(0);
  });

  it("should have DELETE method routes", () => {
    const deleteRoutes = userRoutes.stack.filter(
      (layer) =>
        layer.route && layer.route.methods && layer.route.methods.delete,
    );
    expect(deleteRoutes.length).toBeGreaterThan(0);
  });

  it("should have /all route", () => {
    const allLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/all";
    });
    expect(allLayers.length).toBeGreaterThan(0);
  });

  it("should have /detail route", () => {
    const detailLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/detail";
    });
    expect(detailLayers.length).toBeGreaterThan(0);
  });

  it("should have /create route", () => {
    const createLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/create";
    });
    expect(createLayers.length).toBeGreaterThan(0);
  });

  it("should have /edit route", () => {
    const editLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/edit";
    });
    expect(editLayers.length).toBeGreaterThan(0);
  });

  it("should have /delete route", () => {
    const deleteLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/delete";
    });
    expect(deleteLayers.length).toBeGreaterThan(0);
  });

  it("should have /username-check route", () => {
    const usernameCheckLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/username-check";
    });
    expect(usernameCheckLayers.length).toBeGreaterThan(0);
  });

  it("should have /role-update route", () => {
    const roleUpdateLayers = userRoutes.stack.filter((layer) => {
      return layer.route && layer.route.path === "/role-update";
    });
    expect(roleUpdateLayers.length).toBeGreaterThan(0);
  });

  it("should have avatar routes with userId param", () => {
    const avatarLayers = userRoutes.stack.filter((layer) => {
      const p = layer.route && layer.route.path;
      return p && p.includes("avatar");
    });
    expect(avatarLayers.length).toBeGreaterThan(0);
  });
});
