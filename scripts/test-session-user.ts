import assert from "node:assert/strict";
import { createHmac } from "crypto";

function signPayload(payload: { userId: string; username: string; exp: number }, secret: string) {
  const json = JSON.stringify(payload);
  const base = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", Buffer.from(secret)).update(base).digest().toString("base64url");
  return `${base}.${sig}`;
}

{
  const secret = "test-secret";
  const token = signPayload(
    {
      userId: "11111111-1111-1111-1111-111111111111",
      username: "owner",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    secret
  );
  assert.ok(token.includes("."));
  const [base] = token.split(".");
  const parsed = JSON.parse(Buffer.from(base, "base64url").toString("utf8")) as {
    userId: string;
    username: string;
  };
  assert.equal(parsed.userId, "11111111-1111-1111-1111-111111111111");
  assert.equal(parsed.username, "owner");
}

console.log("test-session-user: ok");
