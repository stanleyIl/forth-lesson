import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/security/passwords.js";

describe("password hashing", () => {
  it("verifies the matching password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword(encoded, "correct horse battery staple"),
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const encoded = await hashPassword("correct password");
    await expect(verifyPassword(encoded, "wrong password")).resolves.toBe(false);
  });

  it("uses a unique salt for each encoded hash", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$/);
    expect(second).toMatch(/^scrypt\$/);
  });

  it("never embeds the plaintext password", async () => {
    const password = "not-stored-in-plaintext";
    const encoded = await hashPassword(password);

    expect(encoded).not.toContain(password);
  });

  it("rejects malformed encoded hashes", async () => {
    await expect(verifyPassword("not-a-password-hash", "value")).resolves.toBe(
      false,
    );
  });
});
