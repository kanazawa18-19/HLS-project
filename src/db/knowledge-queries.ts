import { and, eq, isNull, like, or, type SQL } from "drizzle-orm";
import { knowledgeEntries } from "./schema";

/**
 * ナレッジ一覧の絞り込みパラメータ。otaId/categoryに特殊値 "none" を渡すと
 * 「未設定(未分類)のみ」を表す(棚卸し作業でota_id/categoryがnullの行を洗い出すため)。
 */
export interface KnowledgeFilterParams {
  otaId?: string | null;
  facilityId?: string | null;
  category?: string | null;
  q?: string | null;
  hasContent?: string | null;
}

export function buildKnowledgeConditions(params: KnowledgeFilterParams): SQL[] {
  const conditions: SQL[] = [];

  if (params.otaId === "none") conditions.push(isNull(knowledgeEntries.otaId));
  else if (params.otaId) conditions.push(eq(knowledgeEntries.otaId, Number(params.otaId)));

  if (params.facilityId === "none") conditions.push(isNull(knowledgeEntries.facilityId));
  else if (params.facilityId) conditions.push(eq(knowledgeEntries.facilityId, Number(params.facilityId)));

  if (params.category === "none") conditions.push(isNull(knowledgeEntries.category));
  else if (params.category) conditions.push(eq(knowledgeEntries.category, params.category));

  if (params.hasContent === "true") conditions.push(eq(knowledgeEntries.hasContent, true));
  else if (params.hasContent === "false") conditions.push(eq(knowledgeEntries.hasContent, false));

  if (params.q) {
    const pattern = `%${params.q}%`;
    const clause = or(like(knowledgeEntries.title, pattern), like(knowledgeEntries.body, pattern));
    if (clause) conditions.push(clause);
  }

  return conditions;
}

export function combineConditions(conditions: SQL[]): SQL | undefined {
  return conditions.length > 0 ? and(...conditions) : undefined;
}
