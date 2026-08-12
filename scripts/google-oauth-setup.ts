/**
 * Google Sheets/Docs/Drive連携用のrefresh tokenを取得するための1回限りのセットアップスクリプト。
 * ローカルで実行し、ブラウザでの認可完了後にrefresh tokenを.env.localへ追記する。
 *
 * 使い方: npx tsx scripts/google-oauth-setup.ts
 */
import { google } from "googleapis";
import http from "http";
import { readFileSync, existsSync, appendFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL_PATH = path.join(__dirname, "..", ".env.local");

function loadDotEnvLocal(): void {
  if (!existsSync(ENV_LOCAL_PATH)) return;
  for (const line of readFileSync(ENV_LOCAL_PATH, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}
loadDotEnvLocal();

const PORT = 3940;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が .env.local に設定されていません");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("以下のURLをブラウザで開いて認可してください:\n");
console.log(authUrl);
console.log(`\nlocalhost:${PORT} でコールバックを待機中...`);

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("認可コードが取得できませんでした。");
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("認可が完了しました。このタブは閉じて構いません。");

    if (!tokens.refresh_token) {
      console.error(
        "refresh_tokenが取得できませんでした。既にこのアカウント/クライアントで認可済みの場合、" +
          "Googleアカウントの権限設定からアプリのアクセスを一度取り消してから再実行してください。",
      );
      server.close();
      process.exit(1);
    }

    appendFileSync(ENV_LOCAL_PATH, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log("\n.env.local に GOOGLE_REFRESH_TOKEN を保存しました。");
    server.close();
    process.exit(0);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("トークン交換に失敗しました。");
    console.error("トークン交換エラー:", error);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
