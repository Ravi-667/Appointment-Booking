require("dotenv").config();
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require("../../src/utils/jwt.utils");

describe("JWT Utilities", () => {
  const payload = { sub: "user-123", email: "test@example.com", role: "CUSTOMER" };

  it("should sign and verify access token", () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it("should sign and verify refresh token", () => {
    const token = signRefreshToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
  });

  it("should throw on invalid access token", () => {
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });
});
