import { strict as assert } from "assert";
import { isConfiguredDeveloperUsername } from "../src/main/typescript/elvarg/net/NetworkBuilder";

const original = process.env.DEV_USERNAME;
try {
  delete process.env.DEV_USERNAME;
  assert.equal(isConfiguredDeveloperUsername("Developer"), false);

  process.env.DEV_USERNAME = "  Developer  ";
  assert.equal(isConfiguredDeveloperUsername("developer"), true);
  assert.equal(isConfiguredDeveloperUsername("Player"), false);
} finally {
  if (original === undefined) delete process.env.DEV_USERNAME;
  else process.env.DEV_USERNAME = original;
}

console.log("developer rights smoke test passed");
