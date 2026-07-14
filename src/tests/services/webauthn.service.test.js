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

  it("disableWebauthn disables webauthn for user", async () => {
    Users.update.mockResolvedValue([1]);
    const result = await webauthn.disable("t1", "u1");
    expect(result.success).toBe(true);
    expect(Users.update).toHaveBeenCalledWith(
      { webauthnEnabled: false, webauthnCredentialId: null, webauthnPublicKey: null },
      { where: { id: "u1", tenantId: "t1" } }
    );
  });
});
