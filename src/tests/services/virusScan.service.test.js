jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const { scanFile } = require("../../services/virusScan.service");
const { logger } = require("../../middlewares/activityLog.middleware");


describe("virusScan.service", () => {
  const origEnv = process.env.VIRUS_SCAN_PROVIDER;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VIRUS_SCAN_PROVIDER;
  });

  afterAll(() => {
    if (origEnv !== undefined) {
      process.env.VIRUS_SCAN_PROVIDER = origEnv;
    } else {
      delete process.env.VIRUS_SCAN_PROVIDER;
    }
  });

  describe("scanFile", () => {
    it("should return clean with provider=none by default", async () => {
      const result = await scanFile("/uploads/file.pdf");

      expect(result).toEqual({ clean: true, provider: "none" });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("should return clean when provider=none explicitly set", async () => {
      process.env.VIRUS_SCAN_PROVIDER = "none";
      const result = await scanFile("/uploads/file.pdf");

      expect(result).toEqual({ clean: true, provider: "none" });
    });

    it("should warn and return clean for unimplemented provider", async () => {
      process.env.VIRUS_SCAN_PROVIDER = "clamav";
      const result = await scanFile("/uploads/malware.exe");

      expect(result).toEqual({
        clean: true,
        provider: "clamav",
        reason: "provider-not-implemented",
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'VIRUS_SCAN_PROVIDER="clamav" is not implemented; passing "/uploads/malware.exe" through unscanned'
      );
    });

    it("should warn for any non-none provider", async () => {
      process.env.VIRUS_SCAN_PROVIDER = "custom-scanner";
      const result = await scanFile("/some/path/doc.zip");

      expect(result).toEqual({
        clean: true,
        provider: "custom-scanner",
        reason: "provider-not-implemented",
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'VIRUS_SCAN_PROVIDER="custom-scanner" is not implemented; passing "/some/path/doc.zip" through unscanned'
      );
    });

    it("should pass through the exact absPath in the warning", async () => {
      process.env.VIRUS_SCAN_PROVIDER = "test-provider";
      await scanFile("C:\\Users\\Zed\\uploads\\virus.exe");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("C:\\Users\\Zed\\uploads\\virus.exe")
      );
    });
  });
});
