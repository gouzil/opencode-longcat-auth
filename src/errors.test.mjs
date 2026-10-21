import { test, expect } from "bun:test";
import {
  SIGN_IN,
  SIGN_IN_HEADER,
  isAuthFailure,
  platformError,
  signInExpired,
  signInFromHeaders,
  signInHeaders,
} from "./errors.mjs";

test("the sign-in marker values are the documented ones", () => {
  expect(SIGN_IN.EXPIRED).toBe("expired");
  expect(SIGN_IN.KEPT).toBe("kept");
  expect(SIGN_IN.RENEWED).toBe("renewed");
});

test("the marker header is the one magpie reads", () => {
  expect(SIGN_IN_HEADER).toBe("X-Magpie-Sign-In");
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
  expect(error.signIn).toBe(SIGN_IN.EXPIRED);
  expect(error.status).toBe(401);
  expect(error.message).toContain("api_keys");
});

test("a refusal with no code still says how to fix it", () => {
  const error = signInExpired(401, {});
  expect(error.signIn).toBe(SIGN_IN.EXPIRED);
  expect(error.message).toContain("auth login");
});

test("the sign-in marker is read off response headers", () => {
  expect(signInFromHeaders(new Headers({ [SIGN_IN_HEADER]: "expired" }))).toBe(
    "expired",
  );
  expect(signInFromHeaders({ [SIGN_IN_HEADER]: "kept" })).toBe("kept");
  expect(signInFromHeaders({ [SIGN_IN_HEADER]: "nonsense" })).toBeUndefined();
  expect(signInFromHeaders(undefined)).toBeUndefined();
});

test("the marker headers are the ones to set", () => {
  expect(signInHeaders(SIGN_IN.RENEWED)).toEqual({
    [SIGN_IN_HEADER]: "renewed",
  });
});
