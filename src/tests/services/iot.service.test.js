jest.mock("mqtt");

jest.mock("../../models", () => ({
  CalibrationDevice: {
    unscoped: jest.fn(() => ({
      findOne: jest.fn(),
    })),
  },
  IotReading: {
    create: jest.fn(),
  },
  Notification: {
    create: jest.fn(),
  },
}));

jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mqtt = require("mqtt");
const { CalibrationDevice, IotReading, Notification } = require("../../models");
const { logger } = require("../../middlewares/activityLog.middleware");

describe("iot.service", () => {
  const iot = require("../../services/iot.service");
  const origHost = process.env.MQTT_HOST;
  const origPort = process.env.MQTT_PORT;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MQTT_HOST;
    delete process.env.MQTT_PORT;
    iot.connected = false;
    iot.client = null;
  });

  afterAll(() => {
    if (origHost !== undefined) process.env.MQTT_HOST = origHost;
    else delete process.env.MQTT_HOST;
    if (origPort !== undefined) process.env.MQTT_PORT = origPort;
    else delete process.env.MQTT_PORT;
  });

  describe("connect", () => {
    it("should log info and return early when MQTT_HOST not set", async () => {
      await iot.connect(1883, "broker.local");
      expect(logger.info).toHaveBeenCalledWith(
        "MQTT broker not configured (set MQTT_HOST and MQTT_PORT to enable)"
      );
      expect(mqtt.connect).not.toHaveBeenCalled();
    });

    it("should log info and return early when MQTT_PORT not set", async () => {
      process.env.MQTT_HOST = "broker.local";
      await iot.connect(1883, "broker.local");
      expect(logger.info).toHaveBeenCalledWith(
        "MQTT broker not configured (set MQTT_HOST and MQTT_PORT to enable)"
      );
    });

    it("should connect when both HOST and PORT are configured", async () => {
      process.env.MQTT_HOST = "broker.local";
      process.env.MQTT_PORT = "1883";

      const mockClient = {
        on: jest.fn().mockReturnThis(),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") cb();
          if (event === "error") cb(new Error("fail"));
        }),
        subscribe: jest.fn(),
      };
      mqtt.connect.mockReturnValue(mockClient);

      const result = await iot.connect(1883, "broker.local");
      expect(result).toBe(mockClient);
      expect(mqtt.connect).toHaveBeenCalledWith("mqtt://broker.local:1883", expect.objectContaining({ clean: true }));
    });

    it("should use host/port env vars when not passed as args", async () => {
      process.env.MQTT_HOST = "env-broker";
      process.env.MQTT_PORT = "9999";

      const mockClient = {
        on: jest.fn().mockReturnThis(),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") cb();
        }),
        subscribe: jest.fn(),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await iot.connect();
      expect(mqtt.connect).toHaveBeenCalledWith("mqtt://env-broker:9999", expect.any(Object));
    });

    it("should use passed host/port over env vars when both present", async () => {
      process.env.MQTT_HOST = "env-broker";
      process.env.MQTT_PORT = "9999";

      const mockClient = {
        on: jest.fn().mockReturnThis(),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") cb();
        }),
        subscribe: jest.fn(),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await iot.connect(8888, "arg-broker");
      expect(mqtt.connect).toHaveBeenCalledWith("mqtt://arg-broker:8888", expect.any(Object));
    });

    it("should emit connect event handler that subscribes to device/#", async () => {
      process.env.MQTT_HOST = "broker.local";
      process.env.MQTT_PORT = "1883";

      const mockClient = {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") setImmediate(cb);
        }),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") setImmediate(cb);
        }),
        subscribe: jest.fn((topic, cb) => {
          if (typeof cb === "function") cb(null);
        }),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await iot.connect(1883, "broker.local");
      expect(mockClient.subscribe).toHaveBeenCalledWith("device/#", expect.any(Function));
      expect(logger.info).toHaveBeenCalledWith("IoT MQTT Client subscribed to device/#");
    });

    it("should handle subscribe error", async () => {
      process.env.MQTT_HOST = "broker.local";
      process.env.MQTT_PORT = "1883";

      const mockClient = {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") setImmediate(cb);
        }),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") setImmediate(cb);
        }),
        subscribe: jest.fn((topic, cb) => {
          if (typeof cb === "function") cb(new Error("subscribe failed"));
        }),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await iot.connect(1883, "broker.local");
      expect(logger.error).toHaveBeenCalledWith("IoT MQTT Subscribe Error", expect.objectContaining({ error: "subscribe failed" }));
    });

    it("should handle error event", async () => {
      process.env.MQTT_HOST = "broker.local";
      process.env.MQTT_PORT = "1883";

      const mockClient = {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === "error") setImmediate(() => cb(new Error("conn err")));
        }),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "error") setImmediate(() => cb(new Error("conn err")));
        }),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await expect(iot.connect(1883, "broker.local")).rejects.toThrow("conn err");
      expect(logger.error).toHaveBeenCalledWith("IoT MQTT Client Error", expect.objectContaining({ error: "conn err" }));
    });

    it("should handle close event", async () => {
      process.env.MQTT_HOST = "broker.local";
      process.env.MQTT_PORT = "1883";

      const mockClient = {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === "close") setImmediate(cb);
        }),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") setImmediate(cb);
        }),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await iot.connect(1883, "broker.local");
      expect(logger.warn).toHaveBeenCalledWith("IoT MQTT Client connection closed");
      expect(iot.connected).toBe(false);
    });

    it("should handle reconnect event", async () => {
      process.env.MQTT_HOST = "broker.local";
      process.env.MQTT_PORT = "1883";

      const mockClient = {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === "reconnect") setImmediate(cb);
        }),
        once: jest.fn().mockImplementation((event, cb) => {
          if (event === "connect") setImmediate(cb);
        }),
      };
      mqtt.connect.mockReturnValue(mockClient);

      await iot.connect(1883, "broker.local");
      expect(logger.warn).toHaveBeenCalledWith("IoT MQTT Client reconnecting...");
    });
  });

  describe("publish", () => {
    it("should return false when not connected", async () => {
      iot.connected = false;
      const result = await iot.publish("dev1", "t1", "commands", { cmd: "reset" });
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith("MQTT client not connected, unable to publish");
    });

    it("should publish message and resolve true", async () => {
      const mockClient = {
        publish: jest.fn((topic, payload, opts, cb) => cb(null)),
      };
      iot.client = mockClient;
      iot.connected = true;

      const result = await iot.publish("dev1", "t1", "commands", { cmd: "reset" });
      expect(result).toBe(true);
      expect(mockClient.publish).toHaveBeenCalledWith(
        "commands/dev1/t1",
        JSON.stringify({ cmd: "reset" }),
        { qos: 1 },
        expect.any(Function)
      );
    });

    it("should reject on publish error", async () => {
      const mockClient = {
        publish: jest.fn((topic, payload, opts, cb) => cb(new Error("publish fail"))),
      };
      iot.client = mockClient;
      iot.connected = true;

      await expect(iot.publish("dev1", "t1", "commands", {})).rejects.toThrow("publish fail");
    });
  });

  describe("ingestReading", () => {
    const mockDevice = {
      id: "dev1",
      name: "Sensor Alpha",
      readingTolerance: {
        temperature: { min: 10, max: 50 },
        humidity: { min: 20, max: 80 },
      },
    };

    beforeEach(() => {
      CalibrationDevice.unscoped.mockReturnValue({ findOne: jest.fn() });
    });

    it("should create reading when device found with no anomaly", async () => {
      CalibrationDevice.unscoped().findOne.mockResolvedValue(mockDevice);

      const result = await iot.ingestReading("t1", "dev1", { temperature: 25, humidity: 50 });
      expect(result).toEqual({ success: true, isAnomaly: false });
      expect(IotReading.create).toHaveBeenCalledWith({
        tenantId: "t1",
        deviceId: "dev1",
        metrics: { temperature: 25, humidity: 50 },
        isAnomaly: false,
      });
      expect(Notification.create).not.toHaveBeenCalled();
    });

    it("should detect anomaly when value below min", async () => {
      CalibrationDevice.unscoped().findOne.mockResolvedValue(mockDevice);

      const result = await iot.ingestReading("t1", "dev1", { temperature: 5, humidity: 50 });
      expect(result.isAnomaly).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith({
        tenantId: "t1",
        title: "IoT Anomaly Alert: Sensor Alpha",
        message: expect.stringContaining("temperature"),
        type: "system",
      });
      expect(logger.warn).toHaveBeenCalledWith("IoT Anomaly detected for device dev1", expect.any(Object));
    });

    it("should detect anomaly when value above max", async () => {
      CalibrationDevice.unscoped().findOne.mockResolvedValue(mockDevice);

      const result = await iot.ingestReading("t1", "dev1", { temperature: 60 });
      expect(result.isAnomaly).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith({
        tenantId: "t1",
        title: "IoT Anomaly Alert: Sensor Alpha",
        message: expect.stringContaining("above max"),
        type: "system",
      });
    });

    it("should detect multiple anomalies", async () => {
      CalibrationDevice.unscoped().findOne.mockResolvedValue(mockDevice);

      const result = await iot.ingestReading("t1", "dev1", { temperature: 5, humidity: 90 });
      expect(result.isAnomaly).toBe(true);
      expect(Notification.create).toHaveBeenCalled();
    });

    it("should throw when device not found", async () => {
      CalibrationDevice.unscoped().findOne.mockResolvedValue(null);

      await expect(iot.ingestReading("t1", "dev1", {})).rejects.toThrow("Device not found or IoT disabled");
    });

    it("should create reading even with no tolerance config", async () => {
      const deviceNoTolerance = { id: "dev1", name: "Basic Sensor", readingTolerance: null };
      CalibrationDevice.unscoped().findOne.mockResolvedValue(deviceNoTolerance);

      const result = await iot.ingestReading("t1", "dev1", { temperature: 25 });
      expect(result).toEqual({ success: true, isAnomaly: false });
      expect(IotReading.create).toHaveBeenCalled();
      expect(Notification.create).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should end the mqtt client and nullify state", async () => {
      const mockEnd = jest.fn();
      iot.client = { end: mockEnd };
      iot.connected = true;

      iot.disconnect();
      expect(mockEnd).toHaveBeenCalledWith(false, expect.any(Function));
      expect(iot.connected).toBe(false);
      expect(iot.client).toBeNull();
    });

    it("should be safe when client is null", async () => {
      iot.client = null;
      iot.connected = false;
      iot.disconnect(); // should not throw
      expect(iot.client).toBeNull();
    });
  });
});
