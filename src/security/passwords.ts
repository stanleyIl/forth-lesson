import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 32;
const saltLength = 16;
const defaultParameters = {
  N: 16_384,
  r: 8,
  p: 1,
};

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: typeof defaultParameters,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new Error("Password must not be empty");
  }

  const salt = randomBytes(saltLength);
  const derivedKey = await deriveKey(password, salt, defaultParameters);

  return [
    "scrypt",
    defaultParameters.N,
    defaultParameters.r,
    defaultParameters.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  encodedHash: string,
  submittedPassword: string,
): Promise<boolean> {
  try {
    const [algorithm, n, r, p, saltValue, hashValue, extra] =
      encodedHash.split("$");
    if (
      algorithm !== "scrypt" ||
      extra !== undefined ||
      !n ||
      !r ||
      !p ||
      !saltValue ||
      !hashValue
    ) {
      return false;
    }

    const parameters = {
      N: Number.parseInt(n, 10),
      r: Number.parseInt(r, 10),
      p: Number.parseInt(p, 10),
    };
    if (
      !Number.isInteger(parameters.N) ||
      !Number.isInteger(parameters.r) ||
      !Number.isInteger(parameters.p) ||
      parameters.N <= 1 ||
      parameters.r <= 0 ||
      parameters.p <= 0
    ) {
      return false;
    }

    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== keyLength) {
      return false;
    }

    const actual = await deriveKey(
      submittedPassword,
      Buffer.from(saltValue, "base64url"),
      parameters,
    );
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
