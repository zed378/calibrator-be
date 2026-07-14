/**
 * Tests for RBAC middleware
 */
const {
  rbac,
  checkRoleLevel,
  notSuperAdmin,
} = require("../../middlewares/rbac.middleware");
const { ROLE_NAMES } = require("../../constants");

describe("RBAC Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: {
        id: 1,
        role: {
          name: ROLE_NAMES.USER, // "USER"
          roleLevel: 1,
        },
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  // ================================================================
  // rbac()
  // ================================================================
  describe("rbac()", () => {
    it("should call next() when user role is in required roles", () => {
      const middleware = rbac([ROLE_NAMES.USER]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next() when user is SUPER_ADMIN (bypass)", () => {
      req.user.role.name = "SUPER_ADMIN"; // hardcoded string in rbac.js
      req.user.role.roleLevel = 10;
      const middleware = rbac([ROLE_NAMES.USER]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should pass error to next when no user on request", () => {
      req.user = null;
      const middleware = rbac([ROLE_NAMES.USER]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          message: expect.stringContaining("Unauthorized"),
        }),
      );
    });

    it("should pass error to next when user has no role name", () => {
      req.user.role = {};
      const middleware = rbac([ROLE_NAMES.USER]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          message: expect.stringContaining("Unauthorized"),
        }),
      );
    });

    it("should pass error when role is not in required list and level is lower", () => {
      req.user.role.name = ROLE_NAMES.USER; // "USER", level 1
      req.user.role.roleLevel = 1;
      // ROLE_NAMES.SUPER_ADMIN = "SUPERADMIN" which maps to level 10 in roleLevels
      const middleware = rbac([ROLE_NAMES.SUPER_ADMIN]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: expect.stringContaining("Forbidden"),
        }),
      );
    });

    it("should allow higher role level when allowHigher is true", () => {
      req.user.role.name = ROLE_NAMES.HEALTCARE_ADMIN; // level 8
      req.user.role.roleLevel = 8;
      const middleware = rbac([ROLE_NAMES.USER], { allowHigher: true }); // level 1
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should deny when allowHigher is false and role not in list", () => {
      req.user.role.name = ROLE_NAMES.HEALTCARE_ADMIN;
      req.user.role.roleLevel = 8;
      const middleware = rbac([ROLE_NAMES.USER], { allowHigher: false });
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
        }),
      );
    });

    it("should use role_level if roleLevel is not set", () => {
      req.user.role = { name: ROLE_NAMES.HEALTCARE_ADMIN, role_level: 8 };
      const middleware = rbac([ROLE_NAMES.HEALTCARE_ADMIN]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should handle empty requiredRoles array", () => {
      const middleware = rbac([]);
      middleware(req, res, next);
      // User role "USER" is not in empty array, minRequiredLevel=0, user level=1 -> allowed via allowHigher
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ================================================================
  // checkRoleLevel()
  // ================================================================
  describe("checkRoleLevel()", () => {
    it("should call next() when user role level meets minimum", () => {
      req.user.role.roleLevel = 5;
      const middleware = checkRoleLevel(3);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next() when user role level equals minimum", () => {
      req.user.role.roleLevel = 2;
      const middleware = checkRoleLevel(2);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should pass error when user role level is below minimum", () => {
      req.user.role.roleLevel = 1;
      const middleware = checkRoleLevel(5);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: expect.stringContaining("Forbidden"),
        }),
      );
    });

    it("should pass error when user has no role", () => {
      req.user = {};
      const middleware = checkRoleLevel(1);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
        }),
      );
    });

    it("should default to minLevel 1", () => {
      req.user.role.roleLevel = 1;
      const middleware = checkRoleLevel();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should pass error when role is null", () => {
      req.user.role = null;
      const middleware = checkRoleLevel(1);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
        }),
      );
    });
  });

  // ================================================================
  // notSuperAdmin()
  // ================================================================
  describe("notSuperAdmin()", () => {
    it("should call next() for regular user", () => {
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should pass error for super admin user", () => {
      req.user.role.name = "SUPER_ADMIN";
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: expect.stringContaining("Super admin cannot perform"),
        }),
      );
    });

    it("should call next() for HEALTHCARE_ADMIN", () => {
      req.user.role.name = ROLE_NAMES.HEALTCARE_ADMIN;
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next() when user has no role", () => {
      req.user.role = null;
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should call next() when user is null", () => {
      req.user = null;
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should default user role level to 0 if not set in checkRoleLevel()", () => {
      delete req.user.role.roleLevel;
      const middleware = checkRoleLevel(1);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: "Forbidden: Insufficient role level",
        }),
      );
    });

    it("should default to empty array and empty options if none provided in rbac()", () => {
      const middleware = rbac();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should handle error objects without message in rbac()", () => {
      Object.defineProperty(req, "user", {
        get() {
          throw { name: "TestError" };
        },
        configurable: true,
      });
      const middleware = rbac();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
          message: "Internal Server Error",
        }),
      );
    });

    it("should handle error objects without message in checkRoleLevel()", () => {
      Object.defineProperty(req, "user", {
        get() {
          throw {};
        },
        configurable: true,
      });
      const middleware = checkRoleLevel(1);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
          message: "Internal Server Error",
        }),
      );
    });

    it("should handle error objects without message in notSuperAdmin()", () => {
      Object.defineProperty(req, "user", {
        get() {
          throw {};
        },
        configurable: true,
      });
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
          message: "Internal Server Error",
        }),
      );
    });

    it("should reject SUPERADMIN variant in notSuperAdmin()", () => {
      req.user.role.name = "SUPERADMIN";
      const middleware = notSuperAdmin();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: expect.stringContaining("Super admin cannot perform"),
        }),
      );
    });

    it("should allow user with roleLevel 0 in checkRoleLevel(0)", () => {
      req.user.role.roleLevel = 0;
      const middleware = checkRoleLevel(0);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should deny user with roleLevel 0 when checkRoleLevel(1)", () => {
      req.user.role.roleLevel = 0;
      const middleware = checkRoleLevel(1);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
        }),
      );
    });

    it("should use role_level property in rbac()", () => {
      req.user.role = { name: ROLE_NAMES.HEALTCARE_ADMIN, role_level: 8 };
      const middleware = rbac([ROLE_NAMES.USER]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should deny when user role is undefined in rbac()", () => {
      req.user.role = undefined;
      const middleware = rbac([ROLE_NAMES.USER]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
        }),
      );
    });

    it("should handle unknown role names in requiredRoles", () => {
      req.user.role.name = ROLE_NAMES.USER;
      req.user.role.roleLevel = 1;
      const middleware = rbac(["UNKNOWN_ROLE"]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should allow multiple required roles", () => {
      req.user.role.name = ROLE_NAMES.HEALTCARE_ADMIN;
      req.user.role.roleLevel = 8;
      const middleware = rbac([ROLE_NAMES.USER, ROLE_NAMES.HEALTCARE_ADMIN]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should deny when user role not in multiple required roles and level too low", () => {
      req.user.role.name = ROLE_NAMES.USER;
      req.user.role.roleLevel = 1;
      const middleware = rbac([ROLE_NAMES.HEALTCARE_ADMIN, ROLE_NAMES.ADMIN]);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
        }),
      );
    });
  });
});
