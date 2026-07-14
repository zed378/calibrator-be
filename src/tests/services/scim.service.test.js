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
    destroy: jest.fn(),
  },
}));

const scim = require("../../services/scim.service");
const { Users, Role } = require("../../models");

describe("scim.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("Users", () => {
    it("getUsers returns paginated list with filter", async () => {
      Users.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ id: "u1", email: "a@b.com", firstName: "A", lastName: "B", isActive: true, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() }],
      });
      const result = await scim.getUsers("t1", 1, 10, 'email eq "a@b.com"');
      expect(result.totalResults).toBe(1);
      expect(result.Resources[0].userName).toBe("a@b.com");
    });

    it("getUserById returns user", async () => {
      Users.findOne.mockResolvedValue({ id: "u1", email: "a@b.com", firstName: "A", lastName: "B", isActive: true, status: "ACTIVE" });
      const result = await scim.getUserById("t1", "u1");
      expect(result.id).toBe("u1");
    });

    it("createUser creates new user", async () => {
      Users.findOne.mockResolvedValue(null);
      Users.create.mockResolvedValue({ id: "u1", email: "a@b.com", firstName: "A", lastName: "B", isActive: true, status: "ACTIVE" });
      const result = await scim.createUser("t1", { userName: "a@b.com", name: { givenName: "A", familyName: "B" } });
      expect(result.userName).toBe("a@b.com");
    });

    it("updateUser updates user fields", async () => {
      Users.findOne.mockResolvedValue({ id: "u1", update: jest.fn() });
      const result = await scim.updateUser("t1", "u1", { name: { givenName: "New" } });
      expect(result.id).toBe("u1");
    });

    it("patchUser applies replace operation", async () => {
      Users.findOne.mockResolvedValue({ id: "u1", update: jest.fn() });
      const result = await scim.patchUser("t1", "u1", [{ op: "replace", value: { active: false } }]);
      expect(result.id).toBe("u1");
    });

    it("deleteUser removes user", async () => {
      Users.findOne.mockResolvedValue({ id: "u1", destroy: jest.fn() });
      const result = await scim.deleteUser("t1", "u1");
      expect(result.status).toBe(204);
    });
  });

  describe("Groups", () => {
    it("getGroups returns roles as groups", async () => {
      Role.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ id: "g1", name: "ADMIN", createdAt: new Date(), updatedAt: new Date() }],
      });
      Users.findAll.mockResolvedValue([]);
      const result = await scim.getGroups("t1");
      expect(result.totalResults).toBe(1);
      expect(result.Resources[0].displayName).toBe("ADMIN");
    });

    it("createGroup creates role as group", async () => {
      Role.findOne.mockResolvedValue(null);
      Role.create.mockResolvedValue({ id: "g1", name: "NEW_GROUP", createdAt: new Date(), updatedAt: new Date() });
      Users.update.mockResolvedValue([1]);
      const result = await scim.createGroup("t1", { displayName: "New Group" });
      expect(result.displayName).toBe("NEW_GROUP");
    });

    it("patchGroup adds members", async () => {
      Role.findOne.mockResolvedValue({ id: "g1", name: "GROUP", update: jest.fn() });
      Users.update.mockResolvedValue([1]);
      const result = await scim.patchGroup("t1", "g1", [{ op: "add", value: { members: [{ value: "u1" }] } }]);
      expect(result.displayName).toBe("GROUP");
    });
  });
});
