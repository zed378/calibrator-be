const { describe, it, expect, beforeEach } = require("@jest/globals");

jest.mock("../../models", () => ({
  MenuGroup: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  },
  Role: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
  },
  RoleMenuPermission: {
    findAll: jest.fn(),
    findOrCreate: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock("../../utils/appError.util", () => {
  class AppError extends Error {
    constructor(status, message) {
      super(message);
      this.name = "AppError";
      this.status = status;
    }
  }
  return { AppError };
});

const { MenuGroup, Role, RoleMenuPermission } = require("../../models");
const {
  listMenuGroups,
  getRoleMenuAssignments,
  getAvailableRoles,
  createMenuGroup,
  updateMenuGroup,
  deleteMenuGroup,
  assignMenuToRole,
  revokeMenuFromRole,
  bulkAssign,
  bulkRevoke,
  mapSlugToPath,
  formatMenuGroup,
} = require("../../services/menuGroup.service");

// ---- helper ----
const expectRejectsWithMessage = async (promise, message) => {
  try {
    await promise;
    expect(true).toBe(false);
  } catch (err) {
    expect(err).toBeDefined();
    const actual = (err && err.message) || String(err);
    expect(actual).toContain(message);
  }
};

// ---- fix: MenuGroup.findAll returns plain arrays in service, not instances ----
const mockMenuGroupInstance = (extra = {}) => {
  const obj = {
    id: "mg-1",
    name: "Dashboard",
    slug: "dashboard",
    icon: "dashboard",
    sortOrder: 1,
    parentId: null,
    children: [],
    ...extra,
  };
  return obj;
};

const mockRoleInstance = (extra = {}) => ({ id: "role-1", name: "Admin", sortOrder: 1, ...extra });

// ================================================================
describe("menuGroup.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("mapSlugToPath", () => {
    it("should map known slugs to their known paths", () => {
      expect(mapSlugToPath("home")).toBe("/");
      expect(mapSlugToPath("dashboard")).toBe("/dashboard");
      expect(mapSlugToPath("change-password")).toBe("/dashboard/change-password");
      expect(mapSlugToPath("menu-groups")).toBe("/dashboard/menu-groups");
    });

    it("should fallback to /dashboard/{slug} for unknown slugs", () => {
      expect(mapSlugToPath("my-custom")).toBe("/dashboard/my-custom");
    });
  });

  describe("formatMenuGroup", () => {
    it("should format a group without children", () => {
      const group = mockMenuGroupInstance({ children: [] });
      const result = formatMenuGroup(group);
      expect(result.id).toBe("mg-1");
      expect(result.label).toBe("Dashboard");
      expect(result.path).toBe("/dashboard");
      expect(result.items).toEqual([]);
    });

    it("should format a group with children", () => {
      const child = {
        id: "mg-2",
        name: "Settings",
        slug: "settings",
        icon: "settings",
        sortOrder: 1,
      };
      const group = mockMenuGroupInstance({ children: [child] });
      const result = formatMenuGroup(group);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe("mg-2");
    });

    it("should set isAssigned when isAssignedMap provided", () => {
      const group = mockMenuGroupInstance({});
      const map = { "mg-1": true };
      const result = formatMenuGroup(group, map);
      expect(result.isAssigned).toBe(true);
    });
  });

  // ================================================================
  describe("listMenuGroups", () => {
    it("should return all active parent groups without role filter", async () => {
      const groupA = mockMenuGroupInstance({ id: "g-1", name: "Group A" });
      MenuGroup.findAll.mockResolvedValueOnce([groupA]);

      const result = await listMenuGroups(null);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g-1");
      expect(MenuGroup.findAll).toHaveBeenCalled();
    });

    it("should annotate with isAssigned when roleId provided", async () => {
      const groupA = mockMenuGroupInstance({ id: "g-1" });
      MenuGroup.findAll.mockResolvedValueOnce([groupA]);
      RoleMenuPermission.findAll.mockResolvedValueOnce([
        { menuGroupId: "g-1" },
        { menuGroupId: "g-2" },
      ]);

      const result = await listMenuGroups("role-1");
      expect(result).toHaveLength(1);
      expect(result[0].isAssigned).toBe(true);
      expect(RoleMenuPermission.findAll).toHaveBeenCalledWith({ where: { roleId: "role-1" } });
    });
  });

  // ================================================================
  describe("getRoleMenuAssignments", () => {
    it("should return all groups when parent is assigned", async () => {
      const child = mockMenuGroupInstance({
        id: "c-1", name: "Child 1", slug: "child-1", sortOrder: 1,
      });
      const parent = mockMenuGroupInstance({
        id: "p-1", name: "Parent", slug: "parent", sortOrder: 1,
        children: [child],
      });
      MenuGroup.findAll.mockResolvedValueOnce([parent]);
      RoleMenuPermission.findAll.mockResolvedValueOnce([{ menuGroupId: "p-1" }]);

      const result = await getRoleMenuAssignments("role-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p-1");
      // When parent is assigned, all children should show
      expect(result[0].items.length).toBe(1);
      expect(result[0].items[0].id).toBe("c-1");
    });

    it("should return only explicitly assigned children when parent not assigned", async () => {
      const child1 = mockMenuGroupInstance({ id: "c-1", name: "Child 1", slug: "c1", sortOrder: 1 });
      const child2 = mockMenuGroupInstance({ id: "c-2", name: "Child 2", slug: "c2", sortOrder: 2 });
      const parent = mockMenuGroupInstance({
        id: "p-1", name: "Parent", slug: "parent", sortOrder: 1,
        children: [child1, child2],
      });
      MenuGroup.findAll.mockResolvedValueOnce([parent]);
      // Only child1 is assigned
      RoleMenuPermission.findAll.mockResolvedValueOnce([{ menuGroupId: "c-1" }]);

      const result = await getRoleMenuAssignments("role-1");
      expect(result).toHaveLength(1);
      expect(result[0].items.length).toBe(1);
      expect(result[0].items[0].id).toBe("c-1");
    });
  });

  // ================================================================
  describe("getAvailableRoles", () => {
    it("should fetch all roles ordered by sortOrder", async () => {
      Role.findAll.mockResolvedValueOnce([mockRoleInstance()]);
      const result = await getAvailableRoles();
      expect(Role.findAll).toHaveBeenCalledWith({ order: [["sortOrder", "ASC"]] });
      expect(result).toHaveLength(1);
    });
  });

  // ================================================================
  describe("createMenuGroup", () => {
    it("should create a new menu group with auto-generated slug", async () => {
      const created = mockMenuGroupInstance({ id: "new-1", name: "New Group", slug: "new-group" });
      MenuGroup.create.mockResolvedValueOnce(created);

      const result = await createMenuGroup({ name: "New Group", icon: "icon" });
      expect(result.id).toBe("new-1");
      expect(result.label).toBe("New Group");
      expect(result.path).toBe("/dashboard/new-group");
      expect(MenuGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Group",
          slug: "new-group",
        }),
      );
    });

    it("should use provided slug", async () => {
      const created = mockMenuGroupInstance({ id: "new-2", slug: "custom-slug" });
      MenuGroup.create.mockResolvedValueOnce(created);

      await createMenuGroup({ name: "Custom", slug: "custom-slug", icon: "i" });
      expect(MenuGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "custom-slug" }),
      );
    });
  });

  // ================================================================
  describe("updateMenuGroup", () => {
    it("should update a menu group", async () => {
      const group = {
        id: "mg-1",
        name: "Old Name",
        slug: "old",
        icon: "old-icon",
        sortOrder: 1,
        parentId: null,
        isActive: true,
        children: [],
        update: jest.fn().mockResolvedValue({}),
      };
      MenuGroup.findByPk.mockResolvedValueOnce(group);

      const result = await updateMenuGroup({ id: "mg-1", name: "New Name" });
      expect(result.label).toBe("Old Name");
      expect(group.update).toHaveBeenCalled();
    });

    it("should throw 404 when menu group not found", async () => {
      MenuGroup.findByPk.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(
        updateMenuGroup({ id: "missing", name: "Nope" }),
        "Menu group not found",
      );
    });
  });

  // ================================================================
  describe("deleteMenuGroup", () => {
    it("should delete a menu group and its associations", async () => {
      const group = {
        id: "mg-1",
        destroy: jest.fn().mockResolvedValue(1),
      };
      MenuGroup.findByPk.mockResolvedValueOnce(group);
      RoleMenuPermission.destroy.mockResolvedValueOnce(1);
      MenuGroup.destroy.mockResolvedValueOnce(0);

      await deleteMenuGroup("mg-1");
      expect(RoleMenuPermission.destroy).toHaveBeenCalledWith({ where: { menuGroupId: "mg-1" } });
      expect(MenuGroup.destroy).toHaveBeenCalledWith({ where: { parentId: "mg-1" } });
      expect(group.destroy).toHaveBeenCalled();
    });

    it("should throw 404 when group not found", async () => {
      MenuGroup.findByPk.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(deleteMenuGroup("missing"), "Menu group not found");
    });
  });

  // ================================================================
  describe("assignMenuToRole", () => {
    it("should throw 404 when role not found", async () => {
      Role.findByPk.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(assignMenuToRole({ roleId: "missing", menuGroupId: "mg-1" }), "Role not found");
    });

    it("should throw 404 when menu group not found", async () => {
      Role.findByPk.mockResolvedValueOnce(mockRoleInstance());
      MenuGroup.findByPk.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(
        assignMenuToRole({ roleId: "role-1", menuGroupId: "missing" }),
        "Menu group or item not found",
      );
    });

    it("should create a new permission assignment", async () => {
      Role.findByPk.mockResolvedValueOnce(mockRoleInstance());
      MenuGroup.findByPk.mockResolvedValueOnce(mockMenuGroupInstance());
      const perm = { id: "perm-1", roleId: "role-1", menuGroupId: "mg-1" };
      RoleMenuPermission.findOrCreate.mockResolvedValueOnce([perm, true]);

      const result = await assignMenuToRole({ roleId: "role-1", menuGroupId: "mg-1" });
      expect(result.id).toBe("perm-1");
      expect(RoleMenuPermission.findOrCreate).toHaveBeenCalledWith({
        where: { roleId: "role-1", menuGroupId: "mg-1" },
        defaults: { permissionType: "read" },
      });
    });

    it("should return existing permission when already assigned", async () => {
      Role.findByPk.mockResolvedValueOnce(mockRoleInstance());
      MenuGroup.findByPk.mockResolvedValueOnce(mockMenuGroupInstance());
      const perm = { id: "perm-2" };
      RoleMenuPermission.findOrCreate.mockResolvedValueOnce([perm, false]);

      const result = await assignMenuToRole({ roleId: "role-1", menuGroupId: "mg-1" });
      expect(result.id).toBe("perm-2");
    });
  });

  // ================================================================
  describe("revokeMenuFromRole", () => {
    it("should destroy the permission assignment", async () => {
      await revokeMenuFromRole({ roleId: "role-1", menuGroupId: "mg-1" });
      expect(RoleMenuPermission.destroy).toHaveBeenCalledWith({
        where: { roleId: "role-1", menuGroupId: "mg-1" },
      });
    });
  });

  // ================================================================
  describe("bulkAssign", () => {
    it("should throw 404 when role not found", async () => {
      Role.findByPk.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(bulkAssign("missing", ["mg-1"]), "Role not found");
    });

    it("should assign existing and skip already-assigned", async () => {
      Role.findByPk.mockResolvedValueOnce(mockRoleInstance());
      MenuGroup.findByPk.mockResolvedValueOnce(mockMenuGroupInstance({ id: "mg-1" }));
      MenuGroup.findByPk.mockResolvedValueOnce(mockMenuGroupInstance({ id: "mg-2" }));
      RoleMenuPermission.findOrCreate.mockResolvedValueOnce([{ id: "p1" }, true]); // new
      RoleMenuPermission.findOrCreate.mockResolvedValueOnce([{ id: "p2" }, false]); // existing

      const result = await bulkAssign("role-1", ["mg-1", "mg-2"]);
      expect(result.assigned).toEqual(["mg-1"]);
      expect(result.alreadyAssigned).toEqual(["mg-2"]);
      expect(result.failed).toEqual([]);
    });

    it("should report missing groups in failed list", async () => {
      Role.findByPk.mockResolvedValueOnce(mockRoleInstance());
      MenuGroup.findByPk.mockResolvedValueOnce(null);

      const result = await bulkAssign("role-1", ["missing-mg"]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].menuGroupId).toBe("missing-mg");
    });
  });

  // ================================================================
  describe("bulkRevoke", () => {
    it("should return revoked and notFound lists", async () => {
      RoleMenuPermission.destroy
        .mockResolvedValueOnce(1) // revoked
        .mockResolvedValueOnce(0); // not found

      const result = await bulkRevoke("role-1", ["mg-1", "mg-2"]);
      expect(result.revoked).toEqual(["mg-1"]);
      expect(result.notFound).toEqual(["mg-2"]);
    });
  });
});
