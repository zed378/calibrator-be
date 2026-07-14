/**
 * E-Signature validator tests
 */
const {
  createKeyPair,
  createWorkflow,
  signDocument,
  revokeSignature,
  validate,
} = require("../../validators/eSignature.validator");

describe("E-Signature Validators", () => {
  describe("createKeyPair", () => {
    it("should validate with default values", () => {
      const value = validate({}, createKeyPair);

      expect(value.algorithm).toBe("RSA");
      expect(value.keySize).toBe(2048);
    });

    it("should validate with explicit RSA", () => {
      expect(() =>
        validate({ algorithm: "RSA", keySize: 4096 }, createKeyPair),
      ).not.toThrow();
    });

    it("should validate with ECDSA", () => {
      expect(() =>
        validate({ algorithm: "ECDSA" }, createKeyPair),
      ).not.toThrow();
    });

    it("should validate with Ed25519", () => {
      expect(() =>
        validate({ algorithm: "Ed25519" }, createKeyPair),
      ).not.toThrow();
    });

    it("should validate with label", () => {
      expect(() =>
        validate({ label: "My Signature Key" }, createKeyPair),
      ).not.toThrow();
    });

    it("should reject invalid algorithm", () => {
      expect(() =>
        validate({ algorithm: "DSA" }, createKeyPair),
      ).toThrow();
    });

    it("should reject invalid key size", () => {
      expect(() =>
        validate({ keySize: 1024 }, createKeyPair),
      ).toThrow();
    });
  });

  describe("createWorkflow", () => {
    it("should validate correct workflow data", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "signer@example.com",
                name: "John Doe",
              },
            ],
            subject: "Please sign this document",
          },
          createWorkflow,
        ),
      ).not.toThrow();
    });

    it("should validate with multiple signers", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "signer1@example.com",
                name: "John Doe",
              },
              {
                userId: "user-2",
                email: "signer2@example.com",
                name: "Jane Smith",
              },
            ],
            subject: "Please sign this document",
          },
          createWorkflow,
        ),
      ).not.toThrow();
    });

    it("should validate with message", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "signer@example.com",
                name: "John Doe",
              },
            ],
            subject: "Please sign",
            message: "Kindly review and sign.",
          },
          createWorkflow,
        ),
      ).not.toThrow();
    });

    it("should validate with empty message", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "signer@example.com",
                name: "John Doe",
              },
            ],
            subject: "Please sign",
            message: "",
          },
          createWorkflow,
        ),
      ).not.toThrow();
    });

    it("should validate with expiresAt", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "signer@example.com",
                name: "John Doe",
              },
            ],
            subject: "Please sign",
            expiresAt: "2026-12-31",
          },
          createWorkflow,
        ),
      ).not.toThrow();
    });

    it("should reject missing document ID", () => {
      expect(() =>
        validate(
          {
            signers: [
              {
                userId: "user-1",
                email: "signer@example.com",
                name: "John Doe",
              },
            ],
            subject: "Please sign",
          },
          createWorkflow,
        ),
      ).toThrow();
    });

    it("should reject missing signers", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            subject: "Please sign",
          },
          createWorkflow,
        ),
      ).toThrow();
    });

    it("should reject empty signers array", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [],
            subject: "Please sign",
          },
          createWorkflow,
        ),
      ).toThrow();
    });

    it("should reject signer missing email", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                name: "John Doe",
              },
            ],
            subject: "Please sign",
          },
          createWorkflow,
        ),
      ).toThrow();
    });

    it("should reject invalid email", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "not-an-email",
                name: "John Doe",
              },
            ],
            subject: "Please sign",
          },
          createWorkflow,
        ),
      ).toThrow();
    });

    it("should reject missing subject", () => {
      expect(() =>
        validate(
          {
            documentId: "doc-123",
            signers: [
              {
                userId: "user-1",
                email: "signer@example.com",
                name: "John Doe",
              },
            ],
          },
          createWorkflow,
        ),
      ).toThrow();
    });
  });

  describe("signDocument", () => {
    it("should validate with default authentication method", () => {
      const value = validate({}, signDocument);

      expect(value.authenticationMethod).toBe("password");
    });

    it("should validate with password method", () => {
      expect(() =>
        validate({ authenticationMethod: "password" }, signDocument),
      ).not.toThrow();
    });

    it("should validate with mfa method", () => {
      expect(() =>
        validate({ authenticationMethod: "mfa" }, signDocument),
      ).not.toThrow();
    });

    it("should validate with webauthn method", () => {
      expect(() =>
        validate({ authenticationMethod: "webauthn" }, signDocument),
      ).not.toThrow();
    });

    it("should validate with totp method", () => {
      expect(() =>
        validate({ authenticationMethod: "totp" }, signDocument),
      ).not.toThrow();
    });

    it("should validate with polygon data", () => {
      expect(() =>
        validate({ polygon: { x: 10, y: 20, width: 100, height: 50 } }, signDocument),
      ).not.toThrow();
    });

    it("should validate with null polygon", () => {
      expect(() =>
        validate({ polygon: null }, signDocument),
      ).not.toThrow();
    });

    it("should validate with biometric data", () => {
      expect(() =>
        validate({ biometricData: "abc123" }, signDocument),
      ).not.toThrow();
    });

    it("should validate with all fields", () => {
      expect(() =>
        validate(
          {
            polygon: { x: 10, y: 20 },
            biometricData: "xyz",
            authenticationMethod: "mfa",
            ipAddress: "192.168.1.1",
            userAgent: "Mozilla/5.0",
          },
          signDocument,
        ),
      ).not.toThrow();
    });

    it("should reject invalid authentication method", () => {
      expect(() =>
        validate({ authenticationMethod: "sms" }, signDocument),
      ).toThrow();
    });
  });

  describe("revokeSignature", () => {
    it("should validate with reason", () => {
      expect(() =>
        validate({ reason: "Signature was obtained under duress" }, revokeSignature),
      ).not.toThrow();
    });

    it("should reject missing reason", () => {
      expect(() =>
        validate({}, revokeSignature),
      ).toThrow();
    });

    it("should reject empty reason", () => {
      expect(() =>
        validate({ reason: "" }, revokeSignature),
      ).toThrow();
    });

    it("should reject reason exceeding max length", () => {
      expect(() =>
        validate({ reason: "a".repeat(501) }, revokeSignature),
      ).toThrow();
    });
  });
});
