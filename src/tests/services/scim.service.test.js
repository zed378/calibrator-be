const { Op } = require("sequelize");

jest.mock("../../models", () => ({
  Users: {
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
  Role: {
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

const scim = require("../../services/scim.service");
const { Users, Role } = require("../../models");

describe("scim.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getUsers", () => {
    it("returns paginated list with default pagination and filter=null", async () => {
      Users.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id: "u1",
            email: "a@b.com",
            firstName: "A",
            lastName: "B",
            isActive: true,
            status: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      const result = await scim.getUsers("t1");
      expect(result.totalResults).toBe(1);
      expect(result.Resources[0].userName).toBe("a@b.com");
    });

    it("filters by active=true", async () => {
      Users.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      await scim.getUsers("t1", 1, 10, "active eq true");
      expect(Users.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            status: "ACTIVE",
          }),
        })
      );
    });

    it("filters by active=false", async () => {
      Users.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      await scim.getUsers("t1", 1, 10, "active eq false");
      expect(Users.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: false,
            status: "SUSPENDED",
          }),
        })
      );
    });

    it("filters by email", async () => {
      Users.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      await scim.getUsers("t1", 1, 10, 'email eq "a@b.com"');
      expect(Users.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: "a@b.com",
          }),
        })
      );
    });
  });

  describe("getUserById", () => {
    it("returns user details", async () => {
      Users.findOne.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        isActive: true,
        status: "ACTIVE",
      });
      const result = await scim.getUserById("t1", "u1");
      expect(result.id).toBe("u1");
    });

    it("throws 404 when user not found", async () => {
      Users.findOne.mockResolvedValue(null);
      await expect(scim.getUserById("t1", "u1")).rejects.toThrow("User not found");
    });
  });

  describe("createUser", () => {
    it("creates a new user successfully", async () => {
      Users.findOne.mockResolvedValue(null);
      Users.create.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        isActive: true,
        status: "ACTIVE",
      });

      const result = await scim.createUser("t1", {
        userName: "a@b.com",
        name: { givenName: "A", familyName: "B" },
      });
      expect(result.userName).toBe("a@b.com");
    });

    it("throws 400 when email or userName is missing", async () => {
      await expect(scim.createUser("t1", {})).rejects.toThrow("Email/userName is required");
    });

    it("throws 409 when user already exists", async () => {
      Users.findOne.mockResolvedValue({ id: "u1" });
      await expect(
        scim.createUser("t1", { userName: "existing@test.com" })
      ).rejects.toThrow("User already exists in the system");
    });
  });

  describe("updateUser", () => {
    it("updates user details", async () => {
      const mockUpdate = jest.fn();
      Users.findOne.mockResolvedValue({
        id: "u1",
        firstName: "A",
        lastName: "B",
        isActive: true,
        status: "ACTIVE",
        update: mockUpdate,
      });

      await scim.updateUser("t1", "u1", {
        name: { givenName: "NewFirst", familyName: "NewLast" },
        roleId: 2,
        active: false,
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        firstName: "NewFirst",
        lastName: "NewLast",
        roleId: 2,
        isActive: false,
        status: "SUSPENDED",
      });
    });

    it("throws 404 when user to update not found", async () => {
      Users.findOne.mockResolvedValue(null);
      await expect(scim.updateUser("t1", "u1", {})).rejects.toThrow("User not found");
    });
  });

  describe("patchUser", () => {
    it("applies patch operations for replace, add, and remove", async () => {
      const mockUpdate = jest.fn();
      Users.findOne.mockResolvedValue({
        id: "u1",
        firstName: "A",
        lastName: "B",
        isActive: true,
        status: "ACTIVE",
        update: mockUpdate,
      });

      const patchOps = [
        { op: "replace", value: { name: { givenName: "X", familyName: "Y" }, active: false, roleId: 3 } },
        { op: "add", value: { roleId: 4 } },
        { op: "remove", path: ["roleId"] },
      ];

      await scim.patchUser("t1", "u1", patchOps);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it("handles partial name replacements and empty operations", async () => {
      const mockUpdate = jest.fn();
      Users.findOne.mockResolvedValue({
        id: "u1",
        update: mockUpdate,
      });

      await scim.patchUser("t1", "u1", [
        { op: "replace", value: { name: { givenName: "X" } } },
        { op: "replace", value: { name: { familyName: "Y" } } },
        { op: "replace", value: null },
        { op: "add", value: null },
        { op: "remove", path: null },
      ]);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith({
        firstName: "X",
        lastName: "Y",
      });
    });

    it("throws 404 when user to patch not found", async () => {
      Users.findOne.mockResolvedValue(null);
      await expect(scim.patchUser("t1", "u1", [])).rejects.toThrow("User not found");
    });
  });

  describe("deleteUser", () => {
    it("deletes user successfully", async () => {
      const mockDestroy = jest.fn();
      Users.findOne.mockResolvedValue({
        id: "u1",
        destroy: mockDestroy,
      });

      const result = await scim.deleteUser("t1", "u1");
      expect(result.status).toBe(204);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it("throws 404 when user to delete not found", async () => {
      Users.findOne.mockResolvedValue(null);
      await expect(scim.deleteUser("t1", "u1")).rejects.toThrow("User not found");
    });
  });

  describe("Groups", () => {
    describe("getGroups", () => {
      it("returns groups with displayName filter", async () => {
        Role.findAndCountAll.mockResolvedValue({
          count: 1,
          rows: [{ id: "g1", name: "ADMIN", createdAt: new Date(), updatedAt: new Date() }],
        });
        Users.findAll.mockResolvedValue([]);

        const result = await scim.getGroups("t1", 1, 10, 'displayName eq "ADMIN"');
        expect(result.totalResults).toBe(1);
        expect(result.Resources[0].displayName).toBe("ADMIN");
      });
    });

    describe("getGroupById", () => {
      it("returns group details with members", async () => {
        Role.findOne.mockResolvedValue({
          id: "g1",
          name: "ADMIN",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        Users.findAll.mockResolvedValue([{ id: "u1", email: "a@b.com" }]);

        const result = await scim.getGroupById("t1", "g1");
        expect(result.displayName).toBe("ADMIN");
        expect(result.members[0].value).toBe("u1");
      });

      it("throws 404 when group not found", async () => {
        Role.findOne.mockResolvedValue(null);
        await expect(scim.getGroupById("t1", "g1")).rejects.toThrow("Group not found");
      });
    });

    describe("createGroup", () => {
      it("creates group and associates members (as strings or objects)", async () => {
        Role.findOne.mockResolvedValue(null);
        Role.create.mockResolvedValue({
          id: "g1",
          name: "NEW_GROUP",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        Users.findOne.mockResolvedValue({ id: "u1", update: jest.fn() });
        Users.findAll.mockResolvedValue([{ id: "u1", email: "a@b.com" }]);

        const result = await scim.createGroup("t1", {
          displayName: "New Group",
          members: ["u1", { value: "u2" }],
        });

        expect(result.displayName).toBe("NEW_GROUP");
      });

      it("throws 400 when displayName is missing", async () => {
        await expect(scim.createGroup("t1", {})).rejects.toThrow("displayName is required");
      });

      it("throws 409 when group already exists", async () => {
        Role.findOne.mockResolvedValue({ id: "g1" });
        await expect(
          scim.createGroup("t1", { displayName: "Existing" })
        ).rejects.toThrow("Group already exists");
      });
    });

    describe("updateGroup", () => {
      it("updates group name and updates members", async () => {
        const mockUpdateRole = jest.fn();
        Role.findOne.mockResolvedValue({
          id: "g1",
          update: mockUpdateRole,
        });
        Users.update.mockResolvedValue([1]);
        Users.findAll.mockResolvedValue([]);

        const result = await scim.updateGroup("t1", "g1", {
          displayName: "Updated Group",
          nameToShow: "Updated Group Pretty",
          members: ["u1", { value: "u2" }],
        });

        expect(mockUpdateRole).toHaveBeenCalledWith({
          name: "UPDATED GROUP",
          nameToShow: "Updated Group Pretty",
        });
        expect(Users.update).toHaveBeenCalled();
      });

      it("throws 404 when group not found", async () => {
        Role.findOne.mockResolvedValue(null);
        await expect(scim.updateGroup("t1", "g1", {})).rejects.toThrow("Group not found");
      });
    });

    describe("patchGroup", () => {
      it("applies patch ops (replace, add, remove) on group", async () => {
        Role.findOne.mockResolvedValue({
          id: "g1",
          update: jest.fn(),
        });
        Users.update.mockResolvedValue([1]);
        Users.findAll.mockResolvedValue([]);

        const patchOps = [
          { op: "replace", value: { displayName: "New Display Name" } },
          { op: "add", value: { members: ["u1"] } },
          { op: "remove", value: { members: [{ value: "u2" }] } },
        ];

        await scim.patchGroup("t1", "g1", patchOps);
        expect(Users.update).toHaveBeenCalled();
      });

      it("throws 404 when group not found", async () => {
        Role.findOne.mockResolvedValue(null);
        await expect(scim.patchGroup("t1", "g1", [])).rejects.toThrow("Group not found");
      });
    });

    describe("deleteGroup", () => {
      it("deletes group successfully", async () => {
        const mockDestroy = jest.fn();
        Role.findOne.mockResolvedValue({
          id: "g1",
          destroy: mockDestroy,
        });

        const result = await scim.deleteGroup("t1", "g1");
        expect(result.status).toBe(204);
        expect(mockDestroy).toHaveBeenCalled();
      });

      it("throws 404 when group to delete not found", async () => {
        Role.findOne.mockResolvedValue(null);
        await expect(scim.deleteGroup("t1", "g1")).rejects.toThrow("Group not found");
      });
    });
  });
});
