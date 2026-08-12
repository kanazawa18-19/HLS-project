import { google } from "googleapis";

let client: InstanceType<typeof google.auth.OAuth2> | null = null;

/**
 * Sheets/Docs/Drive用のOAuth2クライアントを取得する。
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN が必要。
 */
export function getGoogleAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  if (client) return client;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN が設定されていません",
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  client = oauth2Client;
  return client;
}
