const { describe, it, expect, beforeEach } = require("@jest/globals");

jest.mock("sequelize", () => ({
  Op: {
    or: Symbol("or"),
    iLike: Symbol("iLike"),
  },
}));

// --- Mock socket.io: getIo harus mock function agar .toHaveBeenCalled() bekerja ---
let _mockToRoom = null;
let _mockEmitArgs = null;

const mockSocket = {
  to: jest.fn((room) => {
    _mockToRoom = room;
    return mockSocket;
  }),
  emit: jest.fn((event, data) => {
    _mockEmitArgs = [event, data];
  }),
};

jest.mock("../../config/socket", () => ({
  getIo: jest.fn(() => mockSocket),
}));

jest.mock("../../config", () => ({
  db: { transaction: jest.fn() },
}));

jest.mock("../../models", () => ({
  Notification: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
  },
}));

jest.mock("../../services/notificationChannels.service", () => ({
  dispatch: jest.fn().mockResolvedValue({ email: "queued" }),
  DEFAULT_CHANNELS: ["realtime"],
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

const { Notification, User } = require("../../models");
const { getIo } = require("../../config/socket");
const notificationChannels = require("../../services/notificationChannels.service");
const {
  emitNotification,
  fetchUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../../services/notification.service");

// ---- helpers ----
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

const mockNotification = (extra = {}) => ({
  id: "n-1",
  title: "Test notification",
  message: "Test message",
  userId: "u-1",
  tenantId: "t-1",
  isRead: false,
  type: "info",
  ...extra,
  toJSON: () => ({ ...extra }),
});

// ================================================================
describe("notification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _mockToRoom = null;
    _mockEmitArgs = null;
  });

  // ================================================================
  describe("emitNotification", () => {
    it("should create and emit a notification via socket.io", async () => {
      const created = mockNotification({ id: "n-new", userId: "u-1" });
      Notification.create.mockResolvedValueOnce(created);

      const result = await emitNotification({
        title: "Test",
        message: "Hello",
        userId: "u-1",
        tenantId: "t-1",
      });

      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test",
          message: "Hello",
          userId: "u-1",
          tenantId: "t-1",
        }),
      );
      expect(getIo).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalled();
      expect(_mockEmitArgs[0]).toBe("new_notification");
      expect(_mockToRoom).toBe("user_u-1");
    });

    it("should emit to tenant room when userId not provided", async () => {
      const created = mockNotification({ id: "n-2", tenantId: "t-2" });
      Notification.create.mockResolvedValueOnce(created);

      await emitNotification({
        title: "Tenant-wide",
        message: "All tenants",
        tenantId: "t-2",
      });

      expect(getIo).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalled();
      expect(_mockEmitArgs[0]).toBe("new_notification");
      expect(_mockToRoom).toBe("tenant_t-2");
    });

    it("should not fail when socket.io throws", async () => {
      Notification.create.mockResolvedValueOnce(
        mockNotification({ id: "n-throw", userId: "u-1" }),
      );
      // Force emit to throw
      mockSocket.emit.mockImplementation(() => {
        throw new Error("Socket not ready");
      });

      const result = await emitNotification({ title: "T", message: "M" });
      // emit is caught internally, returns transformed notification
      expect(result).toBeDefined();
      expect(result.id).toBe("n-throw");
    });

    it("should return null when Notification.create fails", async () => {
      Notification.create.mockRejectedValueOnce(new Error("DB down"));

      const result = await emitNotification({ title: "T", message: "M" });
      expect(result).toBeNull();
    });

    it("should dispatch email/sms channels when specified", async () => {
      const created = mockNotification({ id: "n-3", userId: "u-1" });
      Notification.create.mockResolvedValueOnce(created);
      User.findByPk.mockResolvedValueOnce({
        email: "u@test.com",
        firstName: "User",
      });

      await emitNotification({
        title: "Email test",
        message: "Test",
        userId: "u-1",
        channels: ["email", "sms"],
        recipientEmail: "test@example.com",
      });

      expect(notificationChannels.dispatch).toHaveBeenCalled();
    });
  });

  // ================================================================
  describe("fetchUserNotifications", () => {
    it("should fetch notifications with pagination for a user", async () => {
      Notification.findAndCountAll.mockResolvedValueOnce({
        rows: [mockNotification()],
        count: 1,
      });
      Notification.count.mockResolvedValueOnce(0);

      const result = await fetchUserNotifications({
        tenantId: "t-1",
        userId: "u-1",
        isSuperAdmin: false,
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.meta.total).toBe(1);
      expect(result.data.meta.unread).toBe(0);
      expect(result.data.meta.page).toBe(1);
    });

    it("should fetch for super admin (all tenants)", async () => {
      Notification.findAndCountAll.mockResolvedValueOnce({ rows: [], count: 0 });
      Notification.count.mockResolvedValueOnce(0);

      await fetchUserNotifications({
        tenantId: "t-1",
        userId: "u-1",
        isSuperAdmin: true,
      });

      // Super admin has empty whereClause — no tenantId filter
      expect(Notification.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it("should filter by isRead", async () => {
      Notification.findAndCountAll.mockResolvedValueOnce({ rows: [], count: 0 });
      Notification.count.mockResolvedValueOnce(0);

      await fetchUserNotifications({
        tenantId: "t-1",
        userId: "u-1",
        isRead: true,
      });

      expect(Notification.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRead: true }),
        }),
      );
    });

    it("should filter by type", async () => {
      Notification.findAndCountAll.mockResolvedValueOnce({ rows: [], count: 0 });
      Notification.count.mockResolvedValueOnce(0);

      await fetchUserNotifications({
        tenantId: "t-1",
        userId: "u-1",
        type: "alert",
      });

      expect(Notification.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "alert" }),
        }),
      );
    });

    it("should use safeLimit with MAX_LIMIT cap", async () => {
      Notification.findAndCountAll.mockResolvedValueOnce({ rows: [], count: 0 });
      Notification.count.mockResolvedValueOnce(0);

      await fetchUserNotifications({
        tenantId: "t-1",
        userId: "u-1",
        limit: 9999,
      });

      const callArgs = Notification.findAndCountAll.mock.calls[0][0];
      expect(callArgs.limit).toBe(200); // MAX_LIMIT default
    });

    it("should propagate error on failure", async () => {
      Notification.findAndCountAll.mockRejectedValueOnce(new Error("DB failure"));
      await expectRejectsWithMessage(
        fetchUserNotifications({ tenantId: "t-1", userId: "u-1" }),
        "DB failure",
      );
    });
  });

  // ================================================================
  describe("markAsRead", () => {
    it("should mark a notification as read", async () => {
      const notif = mockNotification({ id: "n-read", isRead: false });
      notif.update = jest.fn().mockResolvedValue({});
      Notification.findOne.mockResolvedValueOnce(notif);

      const result = await markAsRead("t-1", "u-1", "n-read");
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(notif.update).toHaveBeenCalledWith({ isRead: true });
    });

    it("should throw 404 when notification not found", async () => {
      Notification.findOne.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(
        markAsRead("t-1", "u-1", "missing"),
        "Notification not found",
      );
    });
  });

  // ================================================================
  describe("markAllAsRead", () => {
    it("should mark all notifications as read for a user", async () => {
      await markAllAsRead("t-1", "u-1");
      expect(Notification.update).toHaveBeenCalledWith(
        { isRead: true },
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "t-1",
            isRead: false,
          }),
        }),
      );
    });

    it("should throw on database error", async () => {
      Notification.update.mockRejectedValueOnce(new Error("Update failed"));
      await expectRejectsWithMessage(
        markAllAsRead("t-1", "u-1"),
        "Update failed",
      );
    });
  });

  // ================================================================
  describe("deleteNotification", () => {
    it("should delete a notification", async () => {
      const notif = mockNotification({ id: "n-del" });
      notif.destroy = jest.fn().mockResolvedValue(1);
      Notification.findOne.mockResolvedValueOnce(notif);

      const result = await deleteNotification("t-1", "u-1", "n-del");
      expect(result.success).toBe(true);
      expect(notif.destroy).toHaveBeenCalled();
    });

    it("should throw 404 when notification not found", async () => {
      Notification.findOne.mockResolvedValueOnce(null);
      await expectRejectsWithMessage(
        deleteNotification("t-1", "u-1", "missing"),
        "Notification not found",
      );
    });

    it("should throw on database error", async () => {
      Notification.findOne.mockRejectedValueOnce(new Error("Delete failed"));
      await expectRejectsWithMessage(
        deleteNotification("t-1", "u-1", "n-1"),
        "Delete failed",
      );
    });
  });
});
