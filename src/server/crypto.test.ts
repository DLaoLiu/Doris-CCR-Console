import { describe, expect, it } from "vitest";
import { decryptText, encryptText } from "./crypto.js";

describe("credential encryption", () => {
  it("round-trips encrypted text without storing plaintext", () => {
    const secret = Buffer.from("01234567890123456789012345678901");
    const encrypted = encryptText("doris-password", secret);

    expect(encrypted).not.toContain("doris-password");
    expect(decryptText(encrypted, secret)).toBe("doris-password");
  });
});
