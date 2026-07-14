const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

jest.mock("bcryptjs", () => ({
  genSalt: jest.fn().mockResolvedValue("salt"),
  hash: jest.fn().mockResolvedValue("hashedPassword"),
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../utils/seedMenuGroups.util", () => ({
  seedMenuGroups: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../models", () => ({
  Users: {
    findOne: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  },
  Roles: {
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
  MenuGroup: {
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
  RoleMenuPermission: {
    findOne: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  },
  Tenant: {
    findOne: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  },
}));

const { Users, Roles, MenuGroup, RoleMenuPermission, Tenant } = require("../../models");
const { seedMenuGroups } = require("../../utils/seedMenuGroups.util");
const migrationService = require("../../services/migration.service");

describe("migration.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("seedDefaultRoles", () => {
    it("should create all default roles if none exist", async () => {
      Roles.findAll.mockResolvedValue([]);
      Roles.bulkCreate.mockResolvedValue(true);

      const result = await migrationService.seedDefaultRoles();

      expect(Roles.findAll).toHaveBeenCalled();
      expect(Roles.bulkCreate).toHaveBeenCalled();
      expect(result.rolesCreated).toBe(migrationService.DEFAULT_ROLES.length);
      expect(result.rolesSkipped).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it("should skip existing roles", async () => {
      // Mock that the first default role already exists
      const existingRole = migrationService.DEFAULT_ROLES[0];
      Roles.findAll.mockResolvedValue([existingRole]);
      Roles.bulkCreate.mockResolvedValue(true);

      const result = await migrationService.seedDefaultRoles();

      expect(result.rolesCreated).toBe(migrationService.DEFAULT_ROLES.length - 1);
      expect(result.rolesSkipped).toBe(1);
    });

    it("should handle errors", async () => {
      Roles.findAll.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.seedDefaultRoles();

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("DB Error");
    });
  });

  describe("seedApplicationRoles", () => {
    it("should create all application roles if none exist", async () => {
      Roles.findAll.mockResolvedValue([]);
      Roles.bulkCreate.mockResolvedValue(true);

      const result = await migrationService.seedApplicationRoles();

      expect(Roles.findAll).toHaveBeenCalled();
      expect(Roles.bulkCreate).toHaveBeenCalled();
      expect(result.rolesCreated).toBe(migrationService.APPLICATION_ROLES.length);
    });

    it("should handle errors", async () => {
      Roles.findAll.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.seedApplicationRoles();

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("DB Error");
    });
  });

  describe("seedAllRoles", () => {
    it("should combine results of default and application roles", async () => {
      Roles.findAll.mockResolvedValueOnce([]); // Default
      Roles.findAll.mockResolvedValueOnce([]); // Application
      Roles.bulkCreate.mockResolvedValue(true);

      const result = await migrationService.seedAllRoles();

      expect(result.rolesCreated).toBe(
        migrationService.DEFAULT_ROLES.length + migrationService.APPLICATION_ROLES.length,
      );
      expect(result.errors.length).toBe(0);
    });
  });

  describe("seedMenuGroupsAndItems", () => {
    it("should seed menus and permissions successfully", async () => {
      seedMenuGroups.mockResolvedValue(true);

      // For each role in assignments
      Roles.findOne.mockResolvedValue({ id: "role-id" });
      // For each menu slug
      MenuGroup.findOne.mockResolvedValue({ id: "menu-id" });
      // Not existing
      RoleMenuPermission.findOne.mockResolvedValue(null);
      RoleMenuPermission.create.mockResolvedValue(true);

      const result = await migrationService.seedMenuGroupsAndItems();

      expect(seedMenuGroups).toHaveBeenCalled();
      expect(result.menuGroupsCreated).toBe(7);
      expect(result.errors.length).toBe(0);
      expect(result.permissionsAssigned).toBeGreaterThan(0);
    });

    it("should handle missing role", async () => {
      Roles.findOne.mockResolvedValue(null);

      const result = await migrationService.seedMenuGroupsAndItems();

      expect(result.permissionsAssigned).toBe(0);
    });

    it("should handle missing menu group", async () => {
      Roles.findOne.mockResolvedValue({ id: "role-id" });
      MenuGroup.findOne.mockResolvedValue(null);

      const result = await migrationService.seedMenuGroupsAndItems();

      expect(result.permissionsAssigned).toBe(0);
    });

    it("should skip existing permissions", async () => {
      Roles.findOne.mockResolvedValue({ id: "role-id" });
      MenuGroup.findOne.mockResolvedValue({ id: "menu-id" });
      RoleMenuPermission.findOne.mockResolvedValue({ id: "perm-id" }); // exists

      const result = await migrationService.seedMenuGroupsAndItems();

      expect(result.permissionsAssigned).toBe(0);
      expect(result.menuGroupsSkipped).toBeGreaterThan(0);
    });

    it("should handle errors", async () => {
      seedMenuGroups.mockRejectedValue(new Error("Seed Menus Error"));

      const result = await migrationService.seedMenuGroupsAndItems();

      expect(result.errors.length).toBe(1);
    });
  });

  describe("seedRoleMenuPermissions", () => {
    it("should assign permissions to a role", async () => {
      Roles.findOne.mockResolvedValue({ id: "role-1" });
      MenuGroup.findOne.mockResolvedValue({ id: "menu-1" });
      RoleMenuPermission.findOne.mockResolvedValue(null);
      RoleMenuPermission.create.mockResolvedValue(true);

      const result = await migrationService.seedRoleMenuPermissions("ADMIN", ["slug1"], "read");

      expect(result.permissionsAssigned).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should handle role not found", async () => {
      Roles.findOne.mockResolvedValue(null);

      const result = await migrationService.seedRoleMenuPermissions("ADMIN", ["slug1"], "read");

      expect(result.permissionsAssigned).toBe(0);
    });

    it("should handle menu not found", async () => {
      Roles.findOne.mockResolvedValue({ id: "role-1" });
      MenuGroup.findOne.mockResolvedValue(null);

      const result = await migrationService.seedRoleMenuPermissions("ADMIN", ["slug1"], "read");

      expect(result.permissionsAssigned).toBe(0);
    });

    it("should skip existing permissions", async () => {
      Roles.findOne.mockResolvedValue({ id: "role-1" });
      MenuGroup.findOne.mockResolvedValue({ id: "menu-1" });
      RoleMenuPermission.findOne.mockResolvedValue({ id: "perm-1" });

      const result = await migrationService.seedRoleMenuPermissions("ADMIN", ["slug1"], "read");

      expect(result.permissionsAssigned).toBe(0);
    });

    it("should handle errors", async () => {
      Roles.findOne.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.seedRoleMenuPermissions("ADMIN", ["slug1"], "read");

      expect(result.errors.length).toBe(1);
    });
  });

  describe("seedUsers", () => {
    it("should create default users that do not exist yet", async () => {
      // Current behavior: upsert by email (paranoid:false). Non-existent users
      // are created; there is no hard-delete step (existing system users may be
      // referenced by other tables via FK, so they are updated in place).
      Users.findOne.mockResolvedValue(null);
      Users.create.mockResolvedValue(true);

      const result = await migrationService.seedUsers();

      expect(Users.create).toHaveBeenCalledWith(
        expect.objectContaining({ password: expect.any(String) }),
      );
      expect(Users.destroy).not.toHaveBeenCalled();
      expect(result.usersCreated).toBeGreaterThan(0);
      expect(result.usersSkipped).toBe(0);
    });

    it("should update (not recreate) users that already exist", async () => {
      // Existing users are updated in place — never hard-deleted — and counted
      // as skipped; a soft-deleted row is restored first.
      const existing = {
        deletedAt: null,
        update: jest.fn().mockResolvedValue(true),
        restore: jest.fn().mockResolvedValue(true),
      };
      Users.findOne.mockResolvedValue(existing);

      const result = await migrationService.seedUsers();

      expect(existing.update).toHaveBeenCalled();
      expect(Users.create).not.toHaveBeenCalled();
      expect(result.usersCreated).toBe(0);
      expect(result.usersSkipped).toBeGreaterThan(0);
    });

    it("should handle errors", async () => {
      Users.findOne.mockResolvedValue(null);
      Users.create.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.seedUsers();

      expect(result.errors.length).toBe(1);
    });
  });

  describe("unseedRoles", () => {
    it("should delete roles", async () => {
      Roles.destroy.mockResolvedValue(2);

      const result = await migrationService.unseedRoles(["r1", "r2"]);

      expect(Roles.destroy).toHaveBeenCalled();
      expect(result.rolesDeleted).toBe(2);
    });

    it("should handle errors", async () => {
      Roles.destroy.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.unseedRoles(["r1"]);

      expect(result.errors.length).toBe(1);
    });
  });

  describe("unseedUsers", () => {
    it("should delete users", async () => {
      Users.destroy.mockResolvedValue(1);

      const result = await migrationService.unseedUsers(["u1@mail.com"]);

      expect(Users.destroy).toHaveBeenCalled();
      expect(result.usersDeleted).toBe(1);
    });

    it("should handle errors", async () => {
      Users.destroy.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.unseedUsers(["u1@mail.com"]);

      expect(result.errors.length).toBe(1);
    });
  });

  describe("unseedMenuData", () => {
    it("should delete permissions and menus", async () => {
      RoleMenuPermission.destroy.mockResolvedValue(5);
      MenuGroup.destroy.mockResolvedValue(3);

      const result = await migrationService.unseedMenuData();

      expect(RoleMenuPermission.destroy).toHaveBeenCalledWith({ where: {} });
      expect(MenuGroup.destroy).toHaveBeenCalledWith({ where: {} });
      expect(result.roleMenuPermissionsDeleted).toBe(5);
      expect(result.menuGroupsDeleted).toBe(3);
    });

    it("should handle errors", async () => {
      RoleMenuPermission.destroy.mockRejectedValue(new Error("DB Error"));

      const result = await migrationService.unseedMenuData();

      expect(result.errors.length).toBe(1);
    });
  });

  describe("seedAll and unseedAll", () => {
    it("should seedAll", async () => {
      // Mock all the inner functions indirectly by letting them pass
      Roles.findAll.mockResolvedValue([]);
      Roles.bulkCreate.mockResolvedValue(true);
      seedMenuGroups.mockResolvedValue(true);
      Roles.findOne.mockResolvedValue({ id: "role-1" });
      MenuGroup.findOne.mockResolvedValue({ id: "menu-1" });
      RoleMenuPermission.findOne.mockResolvedValue(null);
      Users.findOne.mockResolvedValue(null);
      Tenant.findOne.mockResolvedValue(null);
      Tenant.create.mockResolvedValue(true);

      const result = await migrationService.seedAll();

      expect(result.roles).toBeDefined();
      expect(result.menuGroups).toBeDefined();
      expect(result.users).toBeDefined();
    });

    it("should unseedAll", async () => {
      RoleMenuPermission.destroy.mockResolvedValue(0);
      MenuGroup.destroy.mockResolvedValue(0);
      Users.destroy.mockResolvedValue(0);
      Roles.destroy.mockResolvedValue(0);
      Tenant.destroy.mockResolvedValue(0);

      const result = await migrationService.unseedAll();

      expect(result.menuData).toBeDefined();
      expect(result.users).toBeDefined();
      expect(result.roles).toBeDefined();
    });
  });
});
