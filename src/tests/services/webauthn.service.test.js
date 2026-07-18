jest.mock("../../models", () => ({
  Users: {
    findOne: jest.fn(),
    update: jest.fn(),
  },
}));

const webauthn = require("../../services/webauthn.service");
const { Users } = require("../../models");

describe("webauthn.service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getRegistrationOptions returns challenge and rp info", async () => {
    const user = { id: "u1", email: "test@example.com", firstName: "Test", lastName: "User" };
    const result = await webauthn.getRegistrationOptions(user);
    expect(result.challenge).toBeDefined();
    expect(result.rp.name).toBe("Callibrator");
    expect(result.user.id).toBeDefined();
  });

  it("getLoginOptions returns challenge", async () => {
    const result = await webauthn.getLoginOptions("u1");
    expect(result.challenge).toBeDefined();
    expect(result.rpId).toBeDefined();
  });

  it("verifyRegistration updates user with credential", async () => {
    const user = { id: "u1", email: "test@example.com", firstName: "Test", lastName: "User" };
    const options = await webauthn.getRegistrationOptions(user);
    Users.findOne.mockResolvedValue({ id: "u1", tenantId: "t1" });
    Users.update.mockResolvedValue([1]);

    const mockResponse = {
      rawId: Buffer.from("credential-id").toString("base64url"),
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge })).toString("base64url"),
        attestationObject: Buffer.from("attestation").toString("base64url"),
      },
    };

    const result = await webauthn.verifyRegistration("t1", "u1", mockResponse);
    expect(result.success).toBe(true);
    expect(Users.update).toHaveBeenCalled();
  });

  it("verifyLogin validates assertion and increments sign count", async () => {
    const options = await webauthn.getLoginOptions("u1");
    Users.findOne.mockResolvedValue({
      id: "u1",
      tenantId: "t1",
      webauthnEnabled: true,
      webauthnCredentialId: Buffer.from("credential-id").toString("hex"),
      webauthnPublicKey: "public-key",
      webauthnSignCount: 0,
    });
    Users.update.mockResolvedValue([1]);

    const mockResponse = {
      rawId: Buffer.from("credential-id").toString("base64url"),
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge })).toString("base64url"),
        authenticatorData: Buffer.from("auth-data").toString("base64url"),
        signature: Buffer.from("signature").toString("base64url"),
      },
    };

    const result = await webauthn.verifyLogin("t1", "u1", mockResponse);
    expect(result.success).toBe(true);
  });

  describe("getStatus", () => {
    it("reports an enrolled user as enabled", async () => {
      Users.findOne.mockResolvedValue({
        webauthnEnabled: true,
        webauthnSignCount: 4,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const result = await webauthn.getStatus("t1", "u1");

      expect(Users.findOne).toHaveBeenCalledWith({
        where: { id: "u1", tenantId: "t1" },
        attributes: ["webauthnEnabled", "webauthnSignCount", "updatedAt"],
      });
      expect(result.enabled).toBe(true);
      expect(result.signCount).toBe(4);
      expect(result.lastUpdatedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    });

    it("normalizes an un-enrolled user to enabled=false, signCount=0", async () => {
      Users.findOne.mockResolvedValue({
        webauthnEnabled: null,
        webauthnSignCount: null,
        updatedAt: null,
      });

      const result = await webauthn.getStatus("t1", "u1");

      expect(result.enabled).toBe(false);
      expect(result.signCount).toBe(0);
      expect(result.lastUpdatedAt).toBeNull();
    });

    it("never leaks the credential id or public key", async () => {
      Users.findOne.mockResolvedValue({
        webauthnEnabled: true,
        webauthnSignCount: 1,
        updatedAt: null,
      });

      const result = await webauthn.getStatus("t1", "u1");

      expect(result).not.toHaveProperty("webauthnCredentialId");
      expect(result).not.toHaveProperty("webauthnPublicKey");
    });

    it("throws 404 when the user is not in the tenant", async () => {
      Users.findOne.mockResolvedValue(null);

      await expect(webauthn.getStatus("t1", "nope")).rejects.toMatchObject({
        status: 404,
        message: "User not found",
      });
    });
  });

  it("disableWebauthn disables webauthn for user", async () => {
    Users.update.mockResolvedValue([1]);
    const result = await webauthn.disable("t1", "u1");
    expect(result.success).toBe(true);
    expect(Users.update).toHaveBeenCalledWith(
      { webauthnEnabled: false, webauthnCredentialId: null, webauthnPublicKey: null },
      { where: { id: "u1", tenantId: "t1" } }
    );
  });

  // ================================================================
  // Coverage: options shaping + every verification failure branch
  // ================================================================
  describe("getRegistrationOptions", () => {
    it("maps existing credentials into excludeCredentials", async () => {
      const user = { id: "u1", email: "test@example.com", firstName: "T", lastName: "U" };

      const result = await webauthn.getRegistrationOptions(user, [
        { credentialId: "cred-a", transports: ["internal"] },
        { credentialId: "cred-b" },
      ]);

      expect(result.excludeCredentials).toEqual([
        { id: "cred-a", type: "public-key", transports: ["internal"] },
        // Defaults applied when the stored credential records no transports.
        { id: "cred-b", type: "public-key", transports: ["usb", "nfc", "ble"] },
      ]);
    });

    it("defaults excludeCredentials to empty when none are passed", async () => {
      const result = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "test@example.com",
      });

      expect(result.excludeCredentials).toEqual([]);
    });

    it("falls back to the email as displayName when both names are missing", async () => {
      const result = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "noname@example.com",
      });

      expect(result.user.displayName).toBe("noname@example.com");
      expect(result.user.name).toBe("noname@example.com");
    });

    it("builds displayName from firstName alone when lastName is missing", async () => {
      const result = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "a@example.com",
        firstName: "Ada",
      });

      expect(result.user.displayName).toBe("Ada");
    });

    it("requires user verification and a resident key", async () => {
      const result = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "a@example.com",
      });

      expect(result.authenticatorSelection).toEqual({
        authenticatorAttachment: "platform",
        requireResidentKey: true,
        residentKey: "required",
        userVerification: "required",
      });
      expect(result.pubKeyCredParams).toEqual([
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ]);
      expect(result.attestation).toBe("none");
    });

    it("issues a distinct challenge on every call", async () => {
      const user = { id: "u1", email: "a@example.com" };
      const a = await webauthn.getRegistrationOptions(user);
      const b = await webauthn.getRegistrationOptions(user);

      expect(a.challenge).not.toBe(b.challenge);
    });
  });

  describe("verifyRegistration failures", () => {
    // The service deliberately collapses every internal failure into one
    // generic 400 so it leaks nothing about which check failed.
    const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

    it("rejects an assertion-typed clientData", async () => {
      const options = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "a@example.com",
      });

      await expect(
        webauthn.verifyRegistration("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: options.challenge }),
          },
        }),
      ).rejects.toMatchObject({ status: 400, message: "WebAuthn registration failed" });

      expect(Users.update).not.toHaveBeenCalled();
    });

    it("rejects a mismatched challenge", async () => {
      await webauthn.getRegistrationOptions({ id: "u1", email: "a@example.com" });

      await expect(
        webauthn.verifyRegistration("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({
              type: "webauthn.create",
              challenge: "some-other-challenge",
            }),
          },
        }),
      ).rejects.toMatchObject({ status: 400, message: "WebAuthn registration failed" });

      expect(Users.update).not.toHaveBeenCalled();
    });

    it("rejects when no challenge was ever issued for the user", async () => {
      await expect(
        webauthn.verifyRegistration("t1", "never-started", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.create", challenge: "x" }),
          },
        }),
      ).rejects.toMatchObject({ status: 400, message: "WebAuthn registration failed" });
    });

    it("rejects malformed clientDataJSON", async () => {
      await webauthn.getRegistrationOptions({ id: "u1", email: "a@example.com" });

      await expect(
        webauthn.verifyRegistration("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: Buffer.from("not json").toString("base64url"),
          },
        }),
      ).rejects.toMatchObject({ status: 400, message: "WebAuthn registration failed" });
    });

    it("rejects when the DB update fails", async () => {
      const options = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "a@example.com",
      });
      Users.update.mockRejectedValue(new Error("DB down"));

      await expect(
        webauthn.verifyRegistration("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({
              type: "webauthn.create",
              challenge: options.challenge,
            }),
          },
        }),
      ).rejects.toMatchObject({ status: 400, message: "WebAuthn registration failed" });
    });

    it("persists the credential scoped to the tenant on success", async () => {
      const options = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "a@example.com",
      });
      Users.update.mockResolvedValue([1]);

      await webauthn.verifyRegistration("t1", "u1", {
        rawId: Buffer.from("cred").toString("base64url"),
        response: {
          clientDataJSON: b64url({
            type: "webauthn.create",
            challenge: options.challenge,
          }),
        },
      });

      expect(Users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          webauthnCredentialId: Buffer.from("cred").toString("hex"),
          webauthnSignCount: 0,
          webauthnEnabled: true,
          webauthnPublicKey: expect.any(String),
        }),
        { where: { id: "u1", tenantId: "t1" } },
      );
    });

    it("consumes the challenge so it cannot be replayed", async () => {
      const options = await webauthn.getRegistrationOptions({
        id: "u1",
        email: "a@example.com",
      });
      Users.update.mockResolvedValue([1]);

      const attestation = {
        rawId: Buffer.from("cred").toString("base64url"),
        response: {
          clientDataJSON: b64url({
            type: "webauthn.create",
            challenge: options.challenge,
          }),
        },
      };

      await expect(webauthn.verifyRegistration("t1", "u1", attestation)).resolves.toEqual({
        success: true,
      });
      // Replaying the identical attestation must now fail.
      await expect(
        webauthn.verifyRegistration("t1", "u1", attestation),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("verifyLogin failures", () => {
    // Every internal failure collapses into one generic 401.
    const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

    it("rejects a registration-typed clientData", async () => {
      const options = await webauthn.getLoginOptions("u1");

      await expect(
        webauthn.verifyLogin("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({
              type: "webauthn.create",
              challenge: options.challenge,
            }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });

      expect(Users.findOne).not.toHaveBeenCalled();
    });

    it("rejects a mismatched challenge", async () => {
      await webauthn.getLoginOptions("u1");

      await expect(
        webauthn.verifyLogin("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: "wrong" }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });
    });

    it("rejects when no challenge was ever issued for the user", async () => {
      await expect(
        webauthn.verifyLogin("t1", "never-started", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: "x" }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });
    });

    it("rejects when the user does not exist in the tenant", async () => {
      const options = await webauthn.getLoginOptions("u1");
      Users.findOne.mockResolvedValue(null);

      await expect(
        webauthn.verifyLogin("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: options.challenge }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });

      expect(Users.update).not.toHaveBeenCalled();
    });

    it("rejects when webauthn is not enabled for the user", async () => {
      const options = await webauthn.getLoginOptions("u1");
      Users.findOne.mockResolvedValue({ id: "u1", webauthnEnabled: false });

      await expect(
        webauthn.verifyLogin("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: options.challenge }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });

      expect(Users.update).not.toHaveBeenCalled();
    });

    it("rejects a credential id that does not match the enrolled one", async () => {
      const options = await webauthn.getLoginOptions("u1");
      Users.findOne.mockResolvedValue({
        id: "u1",
        webauthnEnabled: true,
        webauthnCredentialId: Buffer.from("enrolled-cred").toString("hex"),
        webauthnSignCount: 3,
      });

      await expect(
        webauthn.verifyLogin("t1", "u1", {
          rawId: Buffer.from("attacker-cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: options.challenge }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });

      expect(Users.update).not.toHaveBeenCalled();
    });

    it("rejects when the sign-count update fails", async () => {
      const options = await webauthn.getLoginOptions("u1");
      Users.findOne.mockResolvedValue({
        id: "u1",
        webauthnEnabled: true,
        webauthnCredentialId: Buffer.from("cred").toString("hex"),
        webauthnSignCount: 0,
      });
      Users.update.mockRejectedValue(new Error("DB down"));

      await expect(
        webauthn.verifyLogin("t1", "u1", {
          rawId: Buffer.from("cred").toString("base64url"),
          response: {
            clientDataJSON: b64url({ type: "webauthn.get", challenge: options.challenge }),
          },
        }),
      ).rejects.toMatchObject({ status: 401, message: "WebAuthn authentication failed" });
    });

    it("increments the sign count from its stored value on success", async () => {
      const options = await webauthn.getLoginOptions("u1");
      Users.findOne.mockResolvedValue({
        id: "u1",
        webauthnEnabled: true,
        webauthnCredentialId: Buffer.from("cred").toString("hex"),
        webauthnSignCount: 41,
      });
      Users.update.mockResolvedValue([1]);

      await webauthn.verifyLogin("t1", "u1", {
        rawId: Buffer.from("cred").toString("base64url"),
        response: {
          clientDataJSON: b64url({ type: "webauthn.get", challenge: options.challenge }),
        },
      });

      expect(Users.findOne).toHaveBeenCalledWith({
        where: { id: "u1", tenantId: "t1" },
      });
      expect(Users.update).toHaveBeenCalledWith(
        { webauthnSignCount: 42 },
        { where: { id: "u1" } },
      );
    });
  });

  describe("getLoginOptions", () => {
    it("returns an empty allowCredentials list and requires user verification", async () => {
      const result = await webauthn.getLoginOptions("u1");

      expect(result.allowCredentials).toEqual([]);
      expect(result.userVerification).toBe("required");
      expect(result.timeout).toBe(60000);
    });
  });
});
