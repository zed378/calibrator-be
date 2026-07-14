const { Server } = require("socket.io");
const { verifyAccessToken } = require("../utils/jwt.util");
const { User, Tenant, Role } = require("../models");

const isSuperAdminRole = (name) =>
  name === "SUPER_ADMIN" || name === "SUPERADMIN";

let io;

exports.initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust for production
      methods: ["GET", "POST"],
    },
  });

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }

      // NOTE: app tokens are signed with JWT_ACCESS_SECRET (HS256) — the
      // previous process.env.JWT_SECRET was never set, breaking socket auth.
      const decoded = verifyAccessToken(token);

      const user = await User.findByPk(decoded.id, {
        include: [
          { model: Tenant, as: "tenant", attributes: ["id"] },
          { model: Role, as: "role", attributes: ["name"] },
        ],
      });

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error("Socket authentication failed:", err.message);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] User connected: ${socket.user.id} (Tenant: ${socket.user.tenantId})`);

    // Join tenant room for tenant-scoped broadcasts (tenant isolation)
    socket.join(`tenant_${socket.user.tenantId}`);

    // Join user room for direct messages
    socket.join(`user_${socket.user.id}`);

    // Super admins additionally join a global room so they receive EVERY
    // notification across all tenants.
    if (isSuperAdminRole(socket.user.role?.name)) {
      socket.join("super_admins");
    }

    socket.on("disconnect", () => {
      console.log(`[Socket] User disconnected: ${socket.user.id}`);
    });
  });

  return io;
};

exports.getIo = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};
