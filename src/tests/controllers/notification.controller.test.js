/**
 * Tests for notification controller
 */

jest.mock("../../services/notification.service", () => ({
  fetchUserNotifications: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  deleteNotification: jest.fn(),
  emitNotification: jest.fn(),
}));

jest.mock("../../utils/response.util", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

const notificationService = require("../../services/notification.service");
const notificationController = require("../../controllers/notification.controller");
const { success } = require("../../utils/response.util");

describe("notification Controller", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    success.mockImplementation((res, data, meta, message, status) => {
      res.status(status || 200).json({ success: true, data, message });
    });
    req = {
      query: {},
      params: {},
      body: {},
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "550e8400-e29b-41d4-a716-446655440001",
        role: { name: "USER" },
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("fetchUserNotifications", () => {
    it("should return paginated notifications", async () => {
      req.query = { page: "1", limit: "10" };
      notificationService.fetchUserNotifications.mockResolvedValue({
        data: {
          rows: [{ id: "notif-1", message: "Test" }],
          meta: { total: 1 },
        },
        message: "Notifications fetched",
        status: 200,
      });

      await notificationController.fetchUserNotifications(req, res, next);

      expect(notificationService.fetchUserNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "550e8400-e29b-41d4-a716-446655440001",
          userId: "550e8400-e29b-41d4-a716-446655440000",
          isSuperAdmin: false,
          page: "1",
          limit: "10",
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should set isSuperAdmin for SUPER_ADMIN role", async () => {
      req.query = { page: "1", limit: "10" };
      req.user.role.name = "SUPER_ADMIN";
      notificationService.fetchUserNotifications.mockResolvedValue({
        data: { rows: [], meta: { total: 0 } },
      });

      await notificationController.fetchUserNotifications(req, res, next);

      expect(notificationService.fetchUserNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          isSuperAdmin: true,
        }),
      );
    });

    it("should set isSuperAdmin for SUPERADMIN role", async () => {
      req.query = { page: "1", limit: "10" };
      req.user.role.name = "SUPERADMIN";
      notificationService.fetchUserNotifications.mockResolvedValue({
        data: { rows: [], meta: { total: 0 } },
      });

      await notificationController.fetchUserNotifications(req, res, next);

      expect(notificationService.fetchUserNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          isSuperAdmin: true,
        }),
      );
    });

    it("should filter by isRead", async () => {
      req.query = { page: "1", limit: "10", isRead: "true" };
      notificationService.fetchUserNotifications.mockResolvedValue({
        data: { rows: [], meta: { total: 0 } },
      });

      await notificationController.fetchUserNotifications(req, res, next);

      expect(notificationService.fetchUserNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          isRead: "true",
        }),
      );
    });

    it("should filter by type", async () => {
      req.query = { page: "1", limit: "10", type: "ORDER" };
      notificationService.fetchUserNotifications.mockResolvedValue({
        data: { rows: [], meta: { total: 0 } },
      });

      await notificationController.fetchUserNotifications(req, res, next);

      expect(notificationService.fetchUserNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ORDER",
        }),
      );
    });
  });

  describe("markAsRead", () => {
    it("should mark notification as read", async () => {
      req.params = { notificationId: "notif-1" };
      notificationService.markAsRead.mockResolvedValue({
        data: { id: "notif-1", isRead: true },
        message: "Notification marked as read",
        status: 200,
      });

      await notificationController.markAsRead(req, res, next);

      expect(notificationService.markAsRead).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440000",
        "notif-1",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("markAllAsRead", () => {
    it("should mark all notifications as read", async () => {
      notificationService.markAllAsRead.mockResolvedValue({
        message: "All notifications marked as read",
        status: 200,
      });

      await notificationController.markAllAsRead(req, res, next);

      expect(notificationService.markAllAsRead).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440000",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("deleteNotification", () => {
    it("should delete a notification", async () => {
      req.params = { notificationId: "notif-1" };
      notificationService.deleteNotification.mockResolvedValue({
        message: "Notification deleted",
        status: 200,
      });

      await notificationController.deleteNotification(req, res, next);

      expect(notificationService.deleteNotification).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440000",
        "notif-1",
      );
      expect(success).toHaveBeenCalled();
    });
  });

  describe("sendTestNotification", () => {
    it("should emit a test notification (user scope)", async () => {
      req.body = {
        title: "Test",
        message: "Test message",
        type: "SYSTEM",
      };
      notificationService.emitNotification.mockResolvedValue({
        id: "notif-new",
        title: "Test",
      });

      await notificationController.sendTestNotification(req, res, next);

      expect(notificationService.emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "550e8400-e29b-41d4-a716-446655440001",
          userId: "550e8400-e29b-41d4-a716-446655440000",
          type: "SYSTEM",
          title: "Test",
          message: "Test message",
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should emit a test notification (tenant scope)", async () => {
      req.body = {
        scope: "tenant",
        title: "Tenant Alert",
        message: "Tenant-wide message",
        type: "ALERT",
      };
      notificationService.emitNotification.mockResolvedValue({
        id: "notif-new",
        title: "Tenant Alert",
      });

      await notificationController.sendTestNotification(req, res, next);

      expect(notificationService.emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "550e8400-e29b-41d4-a716-446655440001",
          userId: null,
          type: "ALERT",
          title: "Tenant Alert",
          message: "Tenant-wide message",
        }),
      );
      expect(success).toHaveBeenCalled();
    });

    it("should use defaults when body is empty", async () => {
      req.body = {};
      notificationService.emitNotification.mockResolvedValue({
        id: "notif-new",
      });

      await notificationController.sendTestNotification(req, res, next);

      expect(notificationService.emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SYSTEM",
          title: expect.stringContaining("Test notification"),
        }),
      );
    });

    it("should use defaults when body is undefined", async () => {
      req.body = undefined;
      notificationService.emitNotification.mockResolvedValue({
        id: "notif-new",
      });

      await notificationController.sendTestNotification(req, res, next);

      expect(notificationService.emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SYSTEM",
        }),
      );
    });
  });
});
