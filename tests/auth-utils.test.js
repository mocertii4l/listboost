import test from "node:test";
import assert from "node:assert/strict";
import { togglePasswordVisibility } from "../public/auth-utils.js";

test("password visibility toggle changes type and aria label", () => {
  const input = { type: "password" };
  const attrs = {};
  const button = {
    innerHTML: "",
    setAttribute(name, value) {
      attrs[name] = value;
    }
  };

  assert.equal(togglePasswordVisibility(input, button), "text");
  assert.equal(input.type, "text");
  assert.equal(attrs["aria-label"], "Hide password");

  assert.equal(togglePasswordVisibility(input, button), "password");
  assert.equal(input.type, "password");
  assert.equal(attrs["aria-label"], "Show password");
});
