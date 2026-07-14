const { Op } = require("sequelize");
const { db } = require("../config");
const { Notification, User } = require("../models");
const { AppError } = require("../utils/appError.util");
const { DEFAULT_LIMIT, MAX_LIMIT } = require("../constants");
const { getIo } = require("../config/socket");
const notificationChannels = require("./notificationChannels.service");

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
const transformNotification = (notification) => {
  if (!notification) {return null;}
  return notification.toJSON ? notification.toJSON() : { ...notification };
};

const transformNotifications = (rows) => (rows || []).map(transformNotification);

// ------------------------------------------------------------------
// EMIT NOTIFICATION (Internal Use)
// ------------------------------------------------------------------
exports.emitNotification = async (data) => {
  try {
    // Channel-routing fields are not Notification columns — strip them off
    // before persisting the row.
    const {
      channels,
      recipientEmail,
      recipientPhone,
      recipientName,
      ...notifData
    } = data;

    const newNotification = await Notification.create(notifData);
    const transformed = transformNotification(newNotification);

    // --- Realtime channel (socket.io) ---
    // Delivered to the target user OR the target tenant room (tenant isolation),
    // plus the global "super_admins" room so super admins receive every
    // notification. Chaining rooms dedups sockets that are in more than one.
    try {
      const io = getIo();
      let emitter = io.to("super_admins");
      if (notifData.userId) {
        emitter = emitter.to(`user_${notifData.userId}`);
      } else if (notifData.tenantId) {
        emitter = emitter.to(`tenant_${notifData.tenantId}`);
      }
      emitter.emit("new_notification", transformed);
    } catch (socketErr) {
      console.warn("Socket.io emit failed (server might be booting):", socketErr.message);
    }

    // --- Additional channels (email/sms), opt-in via data.channels ---
    const requested = channels || notificationChannels.DEFAULT_CHANNELS;
    if (requested.includes("email") || requested.includes("sms")) {
      try {
        let email = recipientEmail;
        let phone = recipientPhone;
        let name = recipientName;
        // Resolve recipient contact details from the target user if not supplied.
        if (
          notifData.userId &&
          ((requested.includes("email") && !email) ||
            (requested.includes("sms") && !phone))
        ) {
          const u = await User.findByPk(notifData.userId, {
            attributes: ["email", "firstName", "phone"],
          });
          if (u) {
            email = email || u.email;
            phone = phone || u.phone;
            name = name || u.firstName;
          }
        }
        await notificationChannels.dispatch(transformed, {
          channels: requested,
          recipientEmail: email,
          recipientPhone: phone,
          recipientName: name,
        });
      } catch (chErr) {
        console.warn("Notification channel dispatch failed:", chErr.message);
      }
    }

    return transformed;
  } catch (error) {
    console.error("Failed to emit notification:", error);
    // We don't throw here to prevent blocking main flows (like stock reduction) if notification fails
    return null;
  }
};

// ------------------------------------------------------------------
// FETCH USER NOTIFICATIONS
// ------------------------------------------------------------------
exports.fetchUserNotifications = async ({
  tenantId,
  userId,
  isSuperAdmin = false,
  page = 1,
  limit = DEFAULT_LIMIT,
  isRead,
  type,
}) => {
  try {
    // Super admins see EVERY notification across all tenants. Everyone else is
    // scoped to their own tenant (their own + tenant-wide, userId = null).
    const whereClause = isSuperAdmin
      ? {}
      : {
        tenantId,
        [Op.or]: [{ userId: userId }, { userId: null }],
      };

    if (isRead !== undefined) {
      whereClause.isRead = isRead === "true" || isRead === true;
    }
    if (type) {
      whereClause.type = type;
    }

    const safeLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = (Number(page) - 1) * safeLimit;

    const { count, rows } = await Notification.findAndCountAll({
      where: whereClause,
      limit: safeLimit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const unreadCount = await Notification.count({
      where: { ...whereClause, isRead: false },
    });

    return {
      success: true,
      status: 200,
      message: "Fetch notifications successful",
      data: {
        rows: transformNotifications(rows),
        count,
        meta: {
          total: count,
          unread: unreadCount,
          page: Number(page),
          limit: safeLimit,
          totalPages: Math.ceil(count / safeLimit),
        },
      },
    };
  } catch (error) {
    throw {
      status: error.status || 500,
      message: error.message || "Failed to fetch notifications",
    };
  }
};

// ------------------------------------------------------------------
// MARK AS READ
// ------------------------------------------------------------------
exports.markAsRead = async (tenantId, userId, notificationId) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        tenantId,
        [Op.or]: [{ userId }, { userId: null }],
      },
    });

    if (!notification) {
      throw new AppError(404, "Notification not found");
    }

    await notification.update({ isRead: true });

    return {
      success: true,
      status: 200,
      message: "Notification marked as read",
      data: transformNotification(notification),
    };
  } catch (error) {
    throw {
      status: error.status || 500,
      message: error.message || "Failed to mark notification as read",
    };
  }
};

// ------------------------------------------------------------------
// MARK ALL AS READ
// ------------------------------------------------------------------
exports.markAllAsRead = async (tenantId, userId) => {
  try {
    await Notification.update(
      { isRead: true },
      {
        where: {
          tenantId,
          [Op.or]: [{ userId }, { userId: null }],
          isRead: false,
        },
      },
    );

    return {
      success: true,
      status: 200,
      message: "All notifications marked as read",
    };
  } catch (error) {
    throw {
      status: error.status || 500,
      message: error.message || "Failed to mark all notifications as read",
    };
  }
};

// ------------------------------------------------------------------
// DELETE NOTIFICATION
// ------------------------------------------------------------------
exports.deleteNotification = async (tenantId, userId, notificationId) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        tenantId,
        [Op.or]: [{ userId }, { userId: null }],
      },
    });

    if (!notification) {
      throw new AppError(404, "Notification not found");
    }

    await notification.destroy();

    return {
      success: true,
      status: 200,
      message: "Notification deleted successfully",
    };
  } catch (error) {
    throw {
      status: error.status || 500,
      message: error.message || "Failed to delete notification",
    };
  }
};
