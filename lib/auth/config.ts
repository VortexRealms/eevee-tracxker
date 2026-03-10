export const APP_USERNAME = process.env.APP_USERNAME ?? "";
export const APP_PASSWORD = process.env.APP_PASSWORD ?? "";
export const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

if (!SESSION_SECRET) {
  // In dev this will just log; in production you should always set SESSION_SECRET.
  console.warn("SESSION_SECRET is not set. Sessions will not be secure.");
}

export const SESSION_COOKIE_NAME = "eevee_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

