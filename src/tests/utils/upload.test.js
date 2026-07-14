/**
 * Tests for upload utility
 */
const path = require("path");
jest.mock("uuid", () => ({ v4: () => "test-uuid-1234" }));
jest.mock("../../utils/storagePath.util", () =>
  jest.fn((...paths) => `C:/uploads/${paths.join("/")}`),
);

const {
  upload,
  uploadMulti,
  deleteUpload,
  getUploadUrl,
} = require("../../utils/upload.util");
const storagePath = require("../../utils/storagePath.util");

describe("upload utility", () => {
  // ================================================================
  // upload helper
  // ================================================================
  describe("upload", () => {
    it("should return a function", () => {
      expect(typeof upload()).toBe("function");
    });

    it("should accept empty options", () => {
      const middleware = upload({});
      expect(typeof middleware).toBe("function");
    });

    it("should accept custom options with folder and file types", () => {
      const middleware = upload({
        folder: "avatars",
        allowedMimes: ["image/png"],
        allowedExtensions: [".png"],
        maxFileSize: 10 * 1024 * 1024,
      });
      expect(typeof middleware).toBe("function");
    });
  });

  // ================================================================
  // uploadMulti helper
  // ================================================================
  describe("uploadMulti", () => {
    it("should return a function", () => {
      expect(typeof uploadMulti()).toBe("function");
    });

    it("should accept empty options", () => {
      const middleware = uploadMulti({});
      expect(typeof middleware).toBe("function");
    });

    it("should accept maxFiles option", () => {
      const middleware = uploadMulti({ maxFiles: 10 });
      expect(typeof middleware).toBe("function");
    });
  });

  // ================================================================
  // deleteUpload
  // ================================================================
  describe("deleteUpload", () => {
    it("should be a function", () => {
      expect(typeof deleteUpload).toBe("function");
    });
  });

  // ================================================================
  // getUploadUrl
  // ================================================================
  describe("getUploadUrl", () => {
    it("should return correct URL with default folder", () => {
      const url = getUploadUrl("test.jpg");
      expect(url).toBe("/uploads/test.jpg");
    });

    it("should return correct URL with custom folder", () => {
      const url = getUploadUrl("avatar.png", "avatars");
      expect(url).toBe("/avatars/avatar.png");
    });

    it("should handle filenames with special characters", () => {
      const url = getUploadUrl("my-file_123.png", "documents");
      expect(url).toBe("/documents/my-file_123.png");
    });

    it("should handle filenames with dots", () => {
      const url = getUploadUrl("my.file.with.dots.jpg");
      expect(url).toBe("/uploads/my.file.with.dots.jpg");
    });
  });

  // ================================================================
  // storagePath integration
  // ================================================================
  describe("storagePath integration", () => {
    it("should call storagePath with folder and filename for deleteUpload", () => {
      deleteUpload("test.jpg", "avatars");
      expect(storagePath).toHaveBeenCalledWith("avatars", "test.jpg");
    });

    it("should use default folder when not specified", () => {
      deleteUpload("test.jpg");
      expect(storagePath).toHaveBeenCalledWith("uploads", "test.jpg");
    });
  });
});
