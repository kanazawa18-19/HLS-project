import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** OTA/サイトコントローラーのマスタ(Booking.com、楽天トラベル、ねっぱん等)。 */
export const otas = sqliteTable("otas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  // 国内OTA / 海外OTA / サイトコントローラー / その他
  category: text("category").notNull().default("その他"),
  adminUrl: text("admin_url"),
  helpUrl: text("help_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

/** クライアント施設のマスタ(東横イン、ソラリア西鉄ホテル京都プレミア等)。 */
export const facilities = sqliteTable("facilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

/**
 * ナレッジ本体(マニュアル・手順・注意点など)。otaId/facilityIdは任意の関連付けで、
 * 「特定OTA横断の一般ルール」「特定施設固有のルール」のどちらも表現できる。
 */
export const knowledgeEntries = sqliteTable(
  "knowledge_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    body: text("body"),
    // has_content: bodyに実データがあるか(0/1)。Notion由来で本文が空のものを識別するため
    hasContent: integer("has_content", { mode: "boolean" }).notNull().default(false),
    // AIがbodyの原文を読み、現場向けに要点・手順・注意点として明文化したもの(scripts/interpret-knowledge.ts)。
    // 原文(body)は残したまま、閲覧用にはこちらを優先して使う。
    digest: text("digest"),
    otaId: integer("ota_id").references(() => otas.id),
    facilityId: integer("facility_id").references(() => facilities.id),
    // プラン作成 / 部屋作成 / 料金紐づけ / OTAパスワード変更 / 実績計算 / よくある質問 等
    category: text("category"),
    // カンマ区切り。Notion由来のタグをそのまま保持(将来件数が増えたらタグ用の中間テーブルへの正規化を検討)
    tags: text("tags"),
    source: text("source").notNull().default("manual"), // notion_pro_manual / notion_video_manual / drive_pdf / web / manual
    // 例: "notion:1aeabd9e-68bb-43ac-b002-6acc7d7e89bd"。取り込み元での安定したID。
    // sourceUrlはNotionページのタイトル変更でスラッグごと変わりうるため重複排除キーには使わずこちらを使う。
    sourceId: text("source_id").unique(),
    sourceUrl: text("source_url"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [
    index("knowledge_entries_ota_id_idx").on(table.otaId),
    index("knowledge_entries_facility_id_idx").on(table.facilityId),
    index("knowledge_entries_category_idx").on(table.category),
  ],
);
