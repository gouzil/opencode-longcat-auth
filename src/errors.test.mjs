import { test, expect } from "bun:test";
import {
  SIGN_IN_EXPIRED,
  isAuthFailure,
  platformError,
  signInExpired,
} from "./errors.mjs";

test("the sign-in marker is the value OpenCode and magpie read", () => {
  expect(SIGN_IN_EXPIRED).toBe("expired");
});

test("a 401 is an auth failure; a 403 may be", () => {
  expect(isAuthFailure(401)).toBe(true);
  expect(isAuthFailure(403)).toBe(true);
  expect(isAuthFailure(429)).toBe(false);
  expect(isAuthFailure(500)).toBe(false);
});

test("the platform's error shape is read", () => {
  const { code, message } = platformError(
    {
      error: {
        code: "invalid_api_key",
        message: "The key is wrong",
        type: "authentication_error",
      },
    },
    401,
  );
  expect(code).toBe("invalid_api_key");
  expect(message).toBe("The key is wrong");
});

test("a bare string error is read too", () => {
  expect(platformError({ error: "boom" }, 500).message).toBe("boom");
});

test("a missing error falls back to the status", () => {
  expect(platformError({}, 503).message).toContain("503");
});

test("a refusal throws an error marked signIn expired", () => {
  const error = signInExpired(401, {
    error: { code: "invalid_api_key", message: "incorrect api key" },
  });
  expect(error).toBeInstanceOf(Error);
  expect(error.signIn).toBe(SIGN_IN_EXPIRED);
  expect(error.status).toBe(401);
  expect(error.message).toContain("api_keys");
});

test("a refusal with no code still says how to fix it", () => {
  const error = signInExpired(401, {});
  expect(error.signIn).toBe(SIGN_IN_EXPIRED);
  expect(error.message).toContain("auth login");
});
