/**
 * Session controller tests
 */

const { Op } = require("sequelize");
const { AppError } = require("../../utils/appError.util");

// Mock models
const mockSessions = {
  findAndCountAll: jest.fn(),
  findByPk: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
};

const mockUsers = {
  attributes: ["id", "username", "email", "firstName", "lastName"],
};

const mockRoles = {
  attributes: ["id", "name", "nameToShow"],
};

const mockTenants = {
  attributes: ["id", "name"],
};

jest.mock("../../models", () => ({
  Sessions: mockSessions,
  Users: mockUsers,
  Roles: mockRoles,
  Tenants: mockTenants,
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
  badRequest: jest.fn(),
}));

jest.mock("../../utils/controllerWrapper.util", () => ({
  asyncHandlerWithMapping: (fn, errorMap) => {
    return async (req, res, next) => {
      try {
        return await fn(req, res, next);
      } catch (error) {
        const { error: sendError } = require("../../utils/response.util");
        const statusCode = error.status || error.statusCode || 500;
        const message = error.message || "Internal server error";
        return sendError(res, message, statusCode);
      }
    };
  },
}));

const sessionController = require("../../controllers/session.controller");
const { success, error } = require("../../utils/response.util");

const VALID_SESSION_ID = "8c352a92-d6cf-4b71-b0db-6e69622d1b11";
const VALID_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_TENANT_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("Session Controller", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    success.mockImplementation((res, data, meta, message, status) => {
      res.status(status || 200).json({ success: true, data, message });
    });

    req = {
      params: {},
      query: {},
      body: {},
      user: {
        id: VALID_USER_ID,
        role: { name: "USER" },
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe("getAllSessions", () => {
    const mockSessionData = {
      id: VALID_SESSION_ID,
      user_id: VALID_USER_ID,
      user: {
        id: VALID_USER_ID,
        username: "testuser",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        role: { id: "1", name: "USER", nameToShow: "User" },
      },
      tenant: { id: VALID_TENANT_ID, name: "Test Tenant" },
      ip_address: "192.168.1.1",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
      device: "Desktop",
      location: "New York, US",
      is_revoked: false,
      is_active: true,
      expired_at: new Date(Date.now() + 86400000),
      revoked_at: null,
      revoked_reason: null,
      last_activity_at: new Date(),
      created_at: new Date(),
    };

    it("should return paginated sessions", async () => {
      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(mockSessions.findAndCountAll).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });

    it("should filter by userId", async () => {
      req.query = { userId: VALID_USER_ID };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      });

      await sessionController.getAllSessions(req, res);

      expect(mockSessions.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: VALID_USER_ID }),
        }),
      );
    });

    it("should filter by search term", async () => {
      req.query = { search: "192.168" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      });

      await sessionController.getAllSessions(req, res);

      expect(mockSessions.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            [Op.or]: expect.any(Array),
          }),
        }),
      );
    });

    it("should filter by active status", async () => {
      req.query = { status: "active" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      });

      await sessionController.getAllSessions(req, res);

      expect(mockSessions.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_revoked: false,
          }),
        }),
      );
    });

    it("should filter by expired status", async () => {
      req.query = { status: "expired" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      });

      await sessionController.getAllSessions(req, res);

      expect(mockSessions.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expired_at: expect.any(Object),
          }),
        }),
      );
    });

    it("should filter by revoked status", async () => {
      req.query = { status: "revoked" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      });

      await sessionController.getAllSessions(req, res);

      expect(mockSessions.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_revoked: true,
          }),
        }),
      );
    });

    it("should return sessions with correct data structure", async () => {
      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sessions: expect.arrayContaining([
            expect.objectContaining({
              id: VALID_SESSION_ID,
              userId: VALID_USER_ID,
              username: "testuser",
              isActive: true,
              isRevoked: false,
            }),
          ]),
          meta: expect.objectContaining({
            total: 1,
            page: 1,
            limit: 10,
          }),
        }),
        null,
        "Sessions retrieved successfully",
        200,
      );
    });

    it("should handle empty results", async () => {
      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 0,
        rows: [],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalled();
    });
  });

  describe("getSessionById", () => {
    const mockSessionInstance = {
      id: VALID_SESSION_ID,
      user_id: VALID_USER_ID,
      user: {
        id: VALID_USER_ID,
        username: "testuser",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        role: { id: "1", name: "USER", nameToShow: "User" },
      },
      tenant: { id: VALID_TENANT_ID, name: "Test Tenant" },
      ip_address: "192.168.1.1",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
      device: "Desktop",
      location: "New York, US",
      is_revoked: false,
      is_active: true,
      expired_at: new Date(Date.now() + 86400000),
      revoked_at: null,
      revoked_reason: null,
      last_activity_at: new Date(),
      created_at: new Date(),
    };

    it("should return a session by id", async () => {
      req.params = { id: VALID_SESSION_ID };
      mockSessions.findByPk.mockResolvedValue(mockSessionInstance);

      await sessionController.getSessionById(req, res);

      expect(mockSessions.findByPk).toHaveBeenCalledWith(
        VALID_SESSION_ID,
        expect.any(Object),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should throw 404 when session not found", async () => {
      req.params = { id: VALID_SESSION_ID };
      mockSessions.findByPk.mockResolvedValue(null);

      await expect(
        sessionController.getSessionById(req, res),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalled();
    });

    it("should handle session without tenant", async () => {
      req.params = { id: VALID_SESSION_ID };
      const sessionWithoutTenant = {
        ...mockSessionInstance,
        tenant: null,
      };
      mockSessions.findByPk.mockResolvedValue(sessionWithoutTenant);

      await sessionController.getSessionById(req, res);

      expect(success).toHaveBeenCalled();
    });
  });

  describe("revokeSession", () => {
    const mockSessionInstance = {
      id: VALID_SESSION_ID,
      user_id: VALID_USER_ID,
      is_revoked: false,
      update: jest.fn().mockResolvedValue({}),
    };

    it("should revoke a session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.body = { reason: "SECURITY_BREACH" };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue(mockSessionInstance);

      await sessionController.revokeSession(req, res);

      expect(mockSessionInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_revoked: true,
          revoked_reason: "SECURITY_BREACH",
          is_active: false,
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should allow admin to revoke any session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.body = { reason: "ADMIN_REVOKE" };
      req.user = {
        id: "different-user-id",
        role: { name: "SUPER_ADMIN" },
      };
      mockSessions.findByPk.mockResolvedValue({
        ...mockSessionInstance,
        user_id: "different-user-id",
      });

      await sessionController.revokeSession(req, res);

      expect(mockSessionInstance.update).toHaveBeenCalled();
    });

    it("should reject user revoking another user's session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.body = { reason: "TEST" };
      req.user = {
        id: "different-user-id",
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue({
        ...mockSessionInstance,
        user_id: "another-user-id",
      });

      await sessionController.revokeSession(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should reject revoking already revoked session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.body = { reason: "TEST" };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue({
        ...mockSessionInstance,
        is_revoked: true,
      });

      await sessionController.revokeSession(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should throw 404 when session not found", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue(null);

      await sessionController.revokeSession(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should use default reason when not provided", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.body = {};
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue(mockSessionInstance);

      await sessionController.revokeSession(req, res);

      expect(mockSessionInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked_reason: "MANUAL_REVOKE",
        }),
      );
    });
  });

  describe("revokeAllUserSessions", () => {
    it("should revoke all sessions for a user", async () => {
      req.params = { userId: VALID_USER_ID };
      req.body = { reason: "PASSWORD_RESET" };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "SUPER_ADMIN" },
      };
      mockSessions.update.mockResolvedValue([5]); // affected rows

      await sessionController.revokeAllUserSessions(req, res);

      expect(mockSessions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_revoked: true,
          is_active: false,
        }),
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: VALID_USER_ID,
          }),
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should reject non-admin users", async () => {
      req.params = { userId: VALID_USER_ID };
      req.body = { reason: "TEST" };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };

      await sessionController.revokeAllUserSessions(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should use default reason when not provided", async () => {
      req.params = { userId: VALID_USER_ID };
      req.body = {};
      req.user = {
        id: VALID_USER_ID,
        role: { name: "SUPER_ADMIN" },
      };
      mockSessions.update.mockResolvedValue([3]);

      await sessionController.revokeAllUserSessions(req, res);

      expect(mockSessions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked_reason: "ADMIN_REVOKE_ALL",
        }),
        expect.any(Object),
      );
    });
  });

  describe("deleteSession", () => {
    const mockSessionInstance = {
      id: VALID_SESSION_ID,
      user_id: VALID_USER_ID,
      is_revoked: true,
      expired_at: new Date(Date.now() - 86400000), // expired
      destroy: jest.fn().mockResolvedValue({}),
    };

    it("should delete a revoked session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue(mockSessionInstance);

      await sessionController.deleteSession(req, res);

      expect(mockSessionInstance.destroy).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });

    it("should allow admin to delete any session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.user = {
        id: "admin-id",
        role: { name: "SUPER_ADMIN" },
      };
      mockSessions.findByPk.mockResolvedValue({
        ...mockSessionInstance,
        user_id: "other-user-id",
      });

      await sessionController.deleteSession(req, res);

      expect(mockSessionInstance.destroy).toHaveBeenCalled();
    });

    it("should reject deleting active (non-revoked, non-expired) session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue({
        ...mockSessionInstance,
        is_revoked: false,
        expired_at: new Date(Date.now() + 86400000),
      });

      await sessionController.deleteSession(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should reject user deleting another user's session", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.user = {
        id: "different-user-id",
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue({
        ...mockSessionInstance,
        user_id: "other-user-id",
      });

      await sessionController.deleteSession(req, res);

      expect(error).toHaveBeenCalled();
    });

    it("should throw 404 when session not found", async () => {
      req.params = { id: VALID_SESSION_ID };
      req.user = {
        id: VALID_USER_ID,
        role: { name: "USER" },
      };
      mockSessions.findByPk.mockResolvedValue(null);

      await sessionController.deleteSession(req, res);

      expect(error).toHaveBeenCalled();
    });
  });

  describe("getSessionStats", () => {
    it("should return session statistics", async () => {
      req.query = {};
      mockSessions.count.mockImplementation((where) => {
        if (where.is_revoked === true) return Promise.resolve(5);
        if (where.expired_at && where.expired_at[Op.lt])
          return Promise.resolve(10);
        if (
          where.is_revoked === false &&
          where.expired_at &&
          where.expired_at[Op.gte]
        )
          return Promise.resolve(15);
        return Promise.resolve(30);
      });

      await sessionController.getSessionStats(req, res);

      expect(mockSessions.count).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });

    it("should filter stats by userId", async () => {
      req.query = { userId: VALID_USER_ID };
      mockSessions.count.mockResolvedValue(0);

      await sessionController.getSessionStats(req, res);

      // Verify all calls to count include the userId filter
      expect(mockSessions.count).toHaveBeenCalledTimes(4);
      // Check that all calls contain the userId in the where clause
      mockSessions.count.mock.calls.forEach((callArgs) => {
        expect(callArgs[0].where.user_id).toBe(VALID_USER_ID);
      });
    });

    it("should return correct stat structure", async () => {
      req.query = {};
      mockSessions.count.mockResolvedValue(0);

      await sessionController.getSessionStats(req, res);

      expect(success).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          total: 0,
          active: 0,
          expired: 0,
          revoked: 0,
        }),
        null,
        "Session statistics retrieved successfully",
        200,
      );
    });
  });

  describe("Browser and OS Detection in Session Data", () => {
    // Helper functions are not exported, test them indirectly through controller response
    it("should include browser detection in session data", async () => {
      const mockSessionData = {
        id: VALID_SESSION_ID,
        user_id: VALID_USER_ID,
        user: {
          id: VALID_USER_ID,
          username: "testuser",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          role: { id: "1", name: "USER", nameToShow: "User" },
        },
        tenant: null,
        ip_address: "192.168.1.1",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
        device: "Desktop",
        location: "New York, US",
        is_revoked: false,
        is_active: true,
        expired_at: new Date(Date.now() + 86400000),
        revoked_at: null,
        revoked_reason: null,
        last_activity_at: new Date(),
        created_at: new Date(),
      };

      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalled();
      const callArgs = success.mock.calls[0];
      const data = callArgs[1];
      expect(data.sessions[0].browser).toBe("Google Chrome");
    });

    it("should include OS detection in session data", async () => {
      const mockSessionData = {
        id: VALID_SESSION_ID,
        user_id: VALID_USER_ID,
        user: {
          id: VALID_USER_ID,
          username: "testuser",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          role: { id: "1", name: "USER", nameToShow: "User" },
        },
        tenant: null,
        ip_address: "192.168.1.1",
        user_agent:
          "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36",
        device: "Desktop",
        location: "New York, US",
        is_revoked: false,
        is_active: true,
        expired_at: new Date(Date.now() + 86400000),
        revoked_at: null,
        revoked_reason: null,
        last_activity_at: new Date(),
        created_at: new Date(),
      };

      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalled();
      const callArgs = success.mock.calls[0];
      const data = callArgs[1];
      expect(data.sessions[0].os).toBe("Windows");
    });

    it("should include correct status for active session", async () => {
      const mockSessionData = {
        id: VALID_SESSION_ID,
        user_id: VALID_USER_ID,
        user: {
          id: VALID_USER_ID,
          username: "testuser",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          role: { id: "1", name: "USER", nameToShow: "User" },
        },
        tenant: null,
        ip_address: "192.168.1.1",
        user_agent: "Mozilla/5.0",
        device: "Desktop",
        location: "New York, US",
        is_revoked: false,
        is_active: true,
        expired_at: new Date(Date.now() + 86400000),
        revoked_at: null,
        revoked_reason: null,
        last_activity_at: new Date(),
        created_at: new Date(),
      };

      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalled();
      const callArgs = success.mock.calls[0];
      const data = callArgs[1];
      expect(data.sessions[0].status).toBe("active");
    });

    it("should include correct status for revoked session", async () => {
      const mockSessionData = {
        id: VALID_SESSION_ID,
        user_id: VALID_USER_ID,
        user: {
          id: VALID_USER_ID,
          username: "testuser",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          role: { id: "1", name: "USER", nameToShow: "User" },
        },
        tenant: null,
        ip_address: "192.168.1.1",
        user_agent: "Mozilla/5.0",
        device: "Desktop",
        location: "New York, US",
        is_revoked: true,
        is_active: false,
        expired_at: new Date(Date.now() + 86400000),
        revoked_at: new Date(),
        revoked_reason: "ADMIN_REVOKE",
        last_activity_at: new Date(),
        created_at: new Date(),
      };

      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalled();
      const callArgs = success.mock.calls[0];
      const data = callArgs[1];
      expect(data.sessions[0].status).toBe("revoked");
    });

    it("should include correct status for expired session", async () => {
      const mockSessionData = {
        id: VALID_SESSION_ID,
        user_id: VALID_USER_ID,
        user: {
          id: VALID_USER_ID,
          username: "testuser",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          role: { id: "1", name: "USER", nameToShow: "User" },
        },
        tenant: null,
        ip_address: "192.168.1.1",
        user_agent: "Mozilla/5.0",
        device: "Desktop",
        location: "New York, US",
        is_revoked: false,
        is_active: false,
        expired_at: new Date(Date.now() - 86400000),
        revoked_at: null,
        revoked_reason: null,
        last_activity_at: new Date(),
        created_at: new Date(),
      };

      req.query = { page: "1", limit: "10" };
      mockSessions.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockSessionData],
      });

      await sessionController.getAllSessions(req, res);

      expect(success).toHaveBeenCalled();
      const callArgs = success.mock.calls[0];
      const data = callArgs[1];
      expect(data.sessions[0].status).toBe("expired");
    });
  });
});
