import { google, type sheets_v4 } from "googleapis";
import { getGoogleAuthClient } from "./google-auth";

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuthClient() });
  }
  return sheetsClient;
}

/** シートが存在しなければ作成する。既存の場合は何もしない。戻り値はsheetId。 */
async function ensureSheetExists(spreadsheetId: string, title: string): Promise<number> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (existing?.properties?.sheetId != null) return existing.properties.sheetId;

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) throw new Error(`シート "${title}" の作成に失敗しました`);
  return sheetId;
}

/**
 * 指定シートの内容を全て消してから2次元配列を書き込む(完全上書き)。
 * ヘッダー行があればrows[0]がヘッダーとして扱われる想定(スタイル適用は呼び出し側で行う)。
 */
export async function overwriteSheet(
  spreadsheetId: string,
  sheetTitle: string,
  rows: (string | number | null)[][],
): Promise<void> {
  const sheets = getSheets();
  await ensureSheetExists(spreadsheetId, sheetTitle);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: sheetTitle,
  });

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

/**
 * ヘッダー行の書式(太字・背景色)を適用し、その行までを固定する。
 * rowIndexは0始まり(既定0=先頭行)。タイトル行等がヘッダーより上にある場合はrowIndexで指定する。
 */
export async function formatHeaderRow(
  spreadsheetId: string,
  sheetTitle: string,
  columnCount: number,
  rowIndex = 0,
): Promise<void> {
  const sheets = getSheets();
  const sheetId = await ensureSheetExists(spreadsheetId, sheetTitle);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: columnCount,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.19, green: 0.33, blue: 0.59 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                wrapStrategy: "WRAP",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,wrapStrategy)",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: rowIndex + 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ],
    },
  });
}
