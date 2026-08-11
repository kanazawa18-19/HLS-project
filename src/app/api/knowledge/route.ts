import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { knowledgeEntries } from "@/db/schema";
import { buildKnowledgeConditions, combineConditions } from "@/db/knowledge-queries";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);

  const conditions = buildKnowledgeConditions({
    otaId: searchParams.get("otaId"),
    facilityId: searchParams.get("facilityId"),
    category: searchParams.get("category"),
    q: searchParams.get("q"),
    hasContent: searchParams.get("hasContent"),
  });

  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const rows = db
    .select()
    .from(knowledgeEntries)
    .where(combineConditions(conditions))
    .limit(limit)
    .all();

  return NextResponse.json({ entries: rows, count: rows.length });
}
