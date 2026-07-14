/**
 * Tests for fileValidation utility
 */

const {
  validateFileSize,
  validateFileType,
  validateUpload,
  FILE_SIZES,
  ALLOWED_TYPES,
} = require("../../utils/fileValidation.util");

describe("fileValidation", () => {
  describe("FILE_SIZES", () => {
    it("should define size constants", () => {
      expect(FILE_SIZES.KB).toBeDefined();
      expect(FILE_SIZES.MB).toBeDefined();
      expect(FILE_SIZES.GB).toBeDefined();
    });
  });

  describe("ALLOWED_TYPES", () => {
    it("should define allowed file types", () => {
      expect(ALLOWED_TYPES.IMAGE).toBeDefined();
      expect(ALLOWED_TYPES.DOCUMENT).toBeDefined();
      expect(ALLOWED_TYPES.CALIBRATION).toBeDefined();
    });
  });

  describe("validateFileSize", () => {
    it("should accept file within size limit", () => {
      const file = { size: 1024 * 1024 }; // 1MB

      const result = validateFileSize(file, FILE_SIZES.MB * 10);

      expect(result.valid).toBe(true);
      expect(result.message).toBeDefined();
    });

    it("should reject file exceeding size limit", () => {
      const file = { size: FILE_SIZES.MB * 20 }; // 20MB

      const result = validateFileSize(file, FILE_SIZES.MB * 10);

      expect(result.valid).toBe(false);
    });

    it("should default to 10MB limit", () => {
      const file = { size: 1024 };

      const result = validateFileSize(file);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateFileType", () => {
    it("should accept allowed image type", () => {
      const file = { mimetype: "image/png" };

      const result = validateFileType(file, ALLOWED_TYPES.IMAGE);

      expect(result.valid).toBe(true);
    });

    it("should reject disallowed file type", () => {
      const file = { mimetype: "application/executable" };

      const result = validateFileType(file, ALLOWED_TYPES.IMAGE);

      expect(result.valid).toBe(false);
    });

    it("should accept document types", () => {
      const file = { mimetype: "application/pdf" };

      const result = validateFileType(file, ALLOWED_TYPES.DOCUMENT);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateUpload", () => {
    it("should validate a complete upload", () => {
      const file = {
        size: 1024 * 512,
        mimetype: "image/jpeg",
        originalname: "photo.jpg",
      };

      const result = validateUpload(file, {
        maxSize: FILE_SIZES.MB,
        allowedTypes: ALLOWED_TYPES.IMAGE,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject invalid file name", () => {
      const file = {
        size: 1024,
        mimetype: "image/png",
        originalname: "",
      };

      const result = validateUpload(file, {
        maxSize: FILE_SIZES.MB,
        allowedTypes: ALLOWED_TYPES.IMAGE,
      });

      expect(result.valid).toBe(false);
    });
  });
});
