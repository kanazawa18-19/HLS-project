import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvLocal(): void {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
loadDotEnvLocal();

const NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  console.error("NOTION_API_KEY is not set");
  process.exit(1);
}

const DB_PATH = process.env.KNOWLEDGE_DB_PATH ?? path.join(__dirname, "..", "data", "knowledge.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

// ------------------------------------------------------------------
// OTA/サイトコントローラー マスタ初期データ
// ------------------------------------------------------------------
const OTA_SEED: {
  name: string;
  category: string;
  adminUrl?: string;
  helpUrl?: string;
  notes?: string;
}[] = [
  { name: "楽天トラベル", category: "国内OTA", adminUrl: "https://manage.travel.rakuten.co.jp/portal/inn/mp_kanri.main", helpUrl: "https://travel-sd.faq.rakuten.net" },
  { name: "じゃらん", category: "国内OTA", adminUrl: "https://wwws.jalan.net/yw/ywp0100/ywt0100LoginTop.do", helpUrl: "https://jalan-yado.zendesk.com" },
  { name: "一休", category: "国内OTA", adminUrl: "https://www.ikyu.com/accommodation/ap/AsfW10101.aspx", helpUrl: "https://for-partner.custhelp.com/app/home", notes: "審査落選時はYahoo!トラベルで掲載" },
  { name: "るるぶトラベル", category: "国内OTA", adminUrl: "https://pics.jtb.co.jp/ja-jp/kipp/public/login", helpUrl: "https://www.rurubu.travel/content/pics/tutorial/" },
  { name: "ちゅらとく", category: "国内OTA", adminUrl: "https://www.churatoku.net/app_sys/kanri/kanri_login.aspx" },
  { name: "MY REAL TRIP", category: "国内OTA" },
  { name: "Relux", category: "国内OTA" },
  { name: "JATA", category: "国内OTA" },
  { name: "スーパーホテル", category: "国内OTA" },
  { name: "Booking", category: "海外OTA", adminUrl: "https://admin.booking.com/", helpUrl: "https://partner.booking.com/ja", notes: "レートパリティ管理が特に重要" },
  { name: "Expedia", category: "海外OTA", adminUrl: "https://www.expediapartnercentral.com", helpUrl: "https://apps.expediapartnercentral.com/lodging/help/" },
  { name: "Agoda", category: "海外OTA", adminUrl: "https://ycs.agoda.com/en-us/kipp/public/login", helpUrl: "https://partnerhub.agoda.com/" },
  { name: "Ctrip", category: "海外OTA" },
  { name: "Airbnb", category: "海外OTA" },
  { name: "ねっぱん", category: "サイトコントローラー" },
  { name: "手間いらず", category: "サイトコントローラー" },
  { name: "TLリンカーン", category: "サイトコントローラー" },
  { name: "らく通", category: "サイトコントローラー" },
  { name: "i-honex", category: "サイトコントローラー" },
  { name: "bridge", category: "サイトコントローラー" },
  { name: "Pegasus", category: "サイトコントローラー" },
  { name: "陣屋コネクト", category: "サイトコントローラー" },
  { name: "ホテルラボライト", category: "その他", notes: "自社ツール" },
];

// タイトル/タグからOTAを推定するためのキーワード(表記ゆれ対応)
const OTA_KEYWORDS: Record<string, string[]> = {
  "楽天トラベル": ["楽天"],
  "じゃらん": ["じゃらん"],
  "一休": ["一休"],
  "るるぶトラベル": ["るるぶ"],
  "ちゅらとく": ["ちゅらとく"],
  "MY REAL TRIP": ["MY REAL TRIP", "REAL TRIP"],
  "Relux": ["Relux"],
  "JATA": ["JATA"],
  "スーパーホテル": ["スーパーホテル"],
  "Booking": ["Booking"],
  "Expedia": ["Expedia"],
  "Agoda": ["Agoda"],
  "Ctrip": ["Ctrip"],
  "Airbnb": ["Airbnb"],
  "ねっぱん": ["ねっぱん"],
  "手間いらず": ["手間いらず"],
  "TLリンカーン": ["TLリンカーン", "TL リンカーン", "TL-"],
  "らく通": ["らく通"],
  "i-honex": ["i-honex", "ihonex"],
  "bridge": ["bridge"],
  "Pegasus": ["Pegasus"],
  "陣屋コネクト": ["陣屋コネクト", "陣屋"],
  "ホテルラボライト": ["ホテルラボライト"],
};

// 業務カテゴリとして扱うタグ(OTA名ではないもの)
const CATEGORY_TAGS = new Set([
  "プラン作成", "部屋作成", "料金紐づけ", "定期タスク", "画像", "よくある質問",
  "施設ルール", "依頼系", "OTAチェック", "PW更新", "民泊",
]);

const FACILITY_SEED: { name: string; teamName?: string; notes?: string }[] = [
  { name: "ソラリア西鉄ホテル京都プレミア", teamName: "西鉄チーム" },
  { name: "グランドプリンスホテル大阪ベイ", teamName: "プリンスチーム" },
  { name: "東横イン", notes: "2026-08-10 MTGで過去の設定ミス損害事例として言及" },
];

interface NotionRichText {
  plain_text?: string;
}
interface NotionSelectOption {
  name: string;
}
interface NotionProperty {
  type: string;
  title?: NotionRichText[];
  multi_select?: NotionSelectOption[];
  select?: NotionSelectOption | null;
}
interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
}
interface NotionQueryResponse {
  object: string;
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
  message?: string;
}
interface NotionBlockContent {
  rich_text?: NotionRichText[];
}
interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}
interface NotionBlocksResponse {
  object: string;
  results?: NotionBlock[];
  has_more?: boolean;
  next_cursor?: string | null;
  message?: string;
}

function fmtId(raw: string): string {
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function titleOf(props: Record<string, NotionProperty>): string {
  for (const v of Object.values(props)) {
    if (v.type === "title") return (v.title ?? []).map((t) => t.plain_text ?? "").join("");
  }
  return "";
}

function tagsOf(props: Record<string, NotionProperty>): string[] {
  const tags: string[] = [];
  for (const v of Object.values(props)) {
    if (v.type === "multi_select") tags.push(...(v.multi_select ?? []).map((o) => o.name));
    if (v.type === "select" && v.select) tags.push(v.select.name);
  }
  return tags;
}

async function queryNotionDb(id: string, cursor?: string): Promise<NotionQueryResponse> {
  const res = await fetch(`https://api.notion.com/v1/databases/${fmtId(id)}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
  });
  return res.json();
}

// 1ページ100件 x 最大20ページ = 2000件まで。Notionのカタログがこれを超えたら取りこぼすため、
// 到達時は警告ログを出す(現状392件で十分な余裕があるが、無言のキャップにしないための保険)。
const MAX_DB_QUERY_PAGES = 20;

async function fetchAllRows(id: string): Promise<NotionPage[]> {
  const all: NotionPage[] = [];
  let cursor: string | undefined;
  let page = 0;
  for (; page < MAX_DB_QUERY_PAGES; page++) {
    const data = await queryNotionDb(id, cursor);
    if (data.object === "error") {
      console.error("Notion DB query error", id, data.message);
      break;
    }
    all.push(...(data.results ?? []));
    if (data.has_more) cursor = data.next_cursor ?? undefined;
    else break;
  }
  if (page === MAX_DB_QUERY_PAGES) {
    console.warn(`  ⚠ DB ${id}: ページ上限(${MAX_DB_QUERY_PAGES})に到達しました。一部のレコードが取得できていない可能性があります。`);
  }
  return all;
}

function blockPlainText(block: NotionBlock): string {
  const content = block[block.type] as NotionBlockContent | undefined;
  const richText = content?.rich_text ?? [];
  return richText.map((t) => t.plain_text ?? "").join("");
}

interface BodyFetchResult {
  lines: string[];
  ok: boolean; // false: API失敗等で本文を取得しきれなかった(呼び出し元は登録をスキップし次回リトライすべき)
}

async function fetchPageBodyText(pageId: string, depth = 0): Promise<BodyFetchResult> {
  if (depth > 3) return { lines: [], ok: true };
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${NOTION_API_KEY}`, "Notion-Version": "2022-06-28" },
      });
    } catch (error) {
      console.error(`  ⚠ ${pageId}: ネットワークエラー`, error);
      return { lines, ok: false };
    }
    const data: NotionBlocksResponse = await res.json();
    if (data.object === "error") {
      console.error(`  ⚠ ${pageId}: Notion APIエラー (${res.status})`, data.message);
      return { lines, ok: false };
    }
    for (const block of data.results ?? []) {
      const text = blockPlainText(block);
      if (text) lines.push(text);
      else if (block.type === "image") lines.push("[画像]");
      if (block.has_children) {
        const child = await fetchPageBodyText(block.id, depth + 1);
        lines.push(...child.lines);
        if (!child.ok) return { lines, ok: false };
      }
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return { lines, ok: true };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// キーワードによる簡易推定。誤分類は起こりうる前提で、DB上の値を人手で直接修正してよい。
// このスクリプトはsourceId(Notion page ID)で既存行をスキップするため、再実行しても手動修正は上書きされない。
function classify(title: string, tags: string[]): { otaName: string | null; category: string | null } {
  const haystack = `${title} ${tags.join(" ")}`;
  let otaName: string | null = null;
  for (const [name, keywords] of Object.entries(OTA_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      otaName = name;
      break;
    }
  }
  const category = tags.find((t) => CATEGORY_TAGS.has(t)) ?? null;
  return { otaName, category };
}

async function main() {
  console.log("[1/5] running migrations...");
  migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });

  console.log("[2/5] seeding OTA master...");
  const otaIdByName = new Map<string, number>();
  for (const ota of OTA_SEED) {
    const existing = db.select().from(schema.otas).where(eq(schema.otas.name, ota.name)).get();
    if (existing) {
      otaIdByName.set(ota.name, existing.id);
      continue;
    }
    const inserted = db
      .insert(schema.otas)
      .values({ name: ota.name, category: ota.category, adminUrl: ota.adminUrl, helpUrl: ota.helpUrl, notes: ota.notes })
      .returning()
      .get();
    otaIdByName.set(ota.name, inserted.id);
  }
  console.log(`  -> ${otaIdByName.size} OTA/サイトコントローラー`);

  console.log("[3/5] seeding facility master...");
  let facilityCount = 0;
  let facilityUpdated = 0;
  for (const f of FACILITY_SEED) {
    const existing = db.select().from(schema.facilities).where(eq(schema.facilities.name, f.name)).get();
    if (existing) {
      // teamNameはコード側を正とする(directorName/adNameは現場で決めるためここでは触らない)
      if (f.teamName && existing.teamName !== f.teamName) {
        db.update(schema.facilities)
          .set({ teamName: f.teamName, updatedAt: new Date().toISOString() })
          .where(eq(schema.facilities.id, existing.id))
          .run();
        facilityUpdated++;
      }
      continue;
    }
    db.insert(schema.facilities).values({ name: f.name, teamName: f.teamName, notes: f.notes }).run();
    facilityCount++;
  }
  console.log(`  -> ${facilityCount} 施設 (新規)、${facilityUpdated} 施設 (チーム名を更新)`);

  console.log("[4/5] fetching Notion manual catalogs...");
  const proManual = await fetchAllRows("53602be8e3d5488c9195a680f2f9a80b");
  const videoManual = await fetchAllRows("dea42580936f48adbb81c69613232ab2");
  console.log(`  -> Proマニュアル ${proManual.length}件 / ビデオマニュアル作成 ${videoManual.length}件`);

  const catalog = [
    ...proManual.map((r) => ({ row: r, source: "notion_pro_manual" as const })),
    ...videoManual.map((r) => ({ row: r, source: "notion_video_manual" as const })),
  ];

  console.log("[5/5] fetching body text & inserting knowledge_entries...");
  // sourceIdはNotionページIDに基づく安定キー(sourceUrlはタイトル変更でスラッグが変わるため使わない)
  const existingSourceIds = new Set(
    db.select({ sourceId: schema.knowledgeEntries.sourceId }).from(schema.knowledgeEntries).all().map((r) => r.sourceId),
  );

  const toInsert = catalog.filter(({ row }) => !existingSourceIds.has(`notion:${row.id}`));
  console.log(`  -> ${toInsert.length}件を新規登録対象として本文を取得中 (並列5)...`);

  let done = 0;
  const withBody = await mapWithConcurrency(toInsert, 5, async ({ row, source }) => {
    const result = await fetchPageBodyText(row.id);
    done++;
    if (done % 50 === 0) console.log(`    ...${done}/${toInsert.length}`);
    return { row, source, body: result.lines.join("\n"), ok: result.ok };
  });

  let inserted = 0;
  let skippedFailures = 0;
  for (const { row, source, body, ok } of withBody) {
    if (!ok) {
      // 本文取得に失敗した行はDBに登録しない(sourceIdが未登録のまま残るので、次回実行時に自動的に再試行される)
      skippedFailures++;
      continue;
    }
    const title = titleOf(row.properties ?? {}).trim() || "(タイトル未設定)";
    const tags = tagsOf(row.properties ?? {});
    const { otaName, category } = classify(title, tags);
    const otaId = otaName ? (otaIdByName.get(otaName) ?? null) : null;

    db.insert(schema.knowledgeEntries)
      .values({
        title,
        body: body || null,
        hasContent: body.length > 0,
        otaId,
        category,
        tags: tags.join(","),
        source,
        sourceId: `notion:${row.id}`,
        sourceUrl: row.url,
      })
      .run();
    inserted++;
  }
  if (skippedFailures > 0) {
    console.warn(`  ⚠ ${skippedFailures}件は本文取得に失敗したため未登録です。次回の db:seed 実行時に自動的に再試行されます。`);
  }

  console.log(`\n完了: OTA ${otaIdByName.size}件 / 施設 ${FACILITY_SEED.length}件 / ナレッジ ${inserted}件を新規登録`);

  const totalKnowledge = db.select().from(schema.knowledgeEntries).all().length;
  const withContentCount = db.select().from(schema.knowledgeEntries).all().filter((r) => r.hasContent).length;
  console.log(`ナレッジ総数: ${totalKnowledge}件 (本文ありと確認済み: ${withContentCount}件)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sqlite.close());
