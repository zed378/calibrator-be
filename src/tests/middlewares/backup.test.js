/**
 * Tests for backup middleware
 */

// Create mock functions for fs-extra
const mockFse = {
  readdir: jest.fn(),
  stat: jest.fn().mockResolvedValue({ isDirectory: () => false }),
  readFile: jest.fn().mockResolvedValue(Buffer.from("data")),
  copy: jest.fn(),
  remove: jest.fn().mockResolvedValue(undefined),
  pathExists: jest.fn(),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  outputJson: jest.fn(),
  outputFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
};

// Mock node-cron before importing
const mockSchedule = jest.fn();
jest.mock("node-cron", () => ({ schedule: mockSchedule }));
jest.mock("jszip", () =>
  jest.fn().mockImplementation(() => ({
    file: jest.fn().mockReturnThis(),
    generateAsync: jest.fn().mockResolvedValue(Buffer.from([])),
    loadAsync: jest.fn().mockResolvedValue({ files: {} }),
  })),
);
jest.mock("fs-extra", () => mockFse);
jest.mock("../../utils/storagePath.util", () => () => "/fake-backup");
jest.mock("../../middlewares/activityLog.middleware", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let diffReturnValue = 36;
jest.mock("moment-timezone", () => {
  const MockMoment = jest.fn();
  const mockMomentInstance = {
    diff: jest.fn().mockImplementation(() => diffReturnValue),
    tz: jest.fn().mockReturnValue({
      format: jest.fn().mockReturnValue("2026-07-14 10~00~00"),
    }),
  };
  MockMoment.mockImplementation(() => mockMomentInstance);
  MockMoment.default = MockMoment;
  return MockMoment;
});

const {
  backupAndZip,
  cronBackup,
  extractZip,
  deleteOldFiles,
} = require("../../middlewares/backup.middleware");
const { logger } = require("../../middlewares/activityLog.middleware");

describe("backup middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKUP_SCHEDULER = "0 0 * * *";
    diffReturnValue = 36;
  });

  describe("backupAndZip", () => {
    it("should create backup of data and log folders", async () => {
      // pathExists is called once for log folder
      mockFse.pathExists.mockResolvedValue(true);
      // readdir called: log folder, data folder
      // But zipFolder calls addFolderToZip which calls readdir per call
      // log folder: readdir(["log1.txt"]) -> for zipFolder
      // data folder: readdir(["data1.db"]) -> for zipFolder
      mockFse.readdir
        .mockResolvedValueOnce(["log1.txt"])  // log folder
        .mockResolvedValueOnce(["data1.db"]);  // data folder
      
      // copy called 2 times: log then data
      // writeFile called 2 times: log zip then data zip
      
      await backupAndZip();

      expect(mockFse.ensureDir).toHaveBeenCalled();
      expect(mockFse.copy).toHaveBeenCalledTimes(2);
      expect(mockFse.writeFile).toHaveBeenCalled();
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        "Data folder successfully zipped!",
      );
    });

    it("should skip log backup when log folder does not exist", async () => {
      mockFse.pathExists.mockResolvedValue(false);
      mockFse.readdir.mockResolvedValueOnce(["data1.db"]);

      await backupAndZip();

      expect(mockFse.copy).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        "Log folder does not exist, skipping log backup",
      );
    });

    it("should handle errors gracefully", async () => {
      mockFse.ensureDir.mockRejectedValueOnce(
        new Error("Disk error"),
      );

      await backupAndZip();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error during backup and zipping process"),
      );
    });
  });

  describe("extractZip", () => {
    it("should extract zip file to destination", async () => {
      const JSZip = require("jszip");
      JSZip.mockImplementation(() => ({
        loadAsync: jest.fn().mockResolvedValue({
          files: {
            "file1.txt": {
              dir: false,
              async: jest.fn().mockResolvedValue(Buffer.from("content")),
            },
          },
        }),
      }));

      await extractZip("/backup/test.zip", "/dest");

      expect(logger.error).not.toHaveBeenCalled();
    });

    it("should skip directories during extraction", async () => {
      const JSZip = require("jszip");
      JSZip.mockImplementation(() => ({
        loadAsync: jest.fn().mockResolvedValue({
          files: { "dir:/": { dir: true } },
        }),
      }));

      await extractZip("/backup/test.zip", "/dest");

      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("deleteOldFiles", () => {
    it("should remove files older than 30 days", async () => {
      diffReturnValue = 36;
      mockFse.readdir.mockImplementation(() => ["old-backup.zip", "recent.zip"]);

      await deleteOldFiles();

      expect(mockFse.remove).toHaveBeenCalledWith(
        expect.stringContaining("old-backup"),
      );
    });

    it("should not remove files within 30 days", async () => {
      diffReturnValue = 5;
      mockFse.readdir.mockImplementation(() => ["recent.zip"]);

      await deleteOldFiles();

      expect(mockFse.remove).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      mockFse.readdir.mockImplementation(() => {
        throw new Error("Read error");
      });

      await deleteOldFiles();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error deleting old files"),
      );
    });
  });

  describe("cronBackup", () => {
    it("should schedule cron job", () => {
      process.env.BACKUP_SCHEDULER = "0 0 * * *";
      cronBackup();
      expect(mockSchedule).toHaveBeenCalled();
    });
  });
});
