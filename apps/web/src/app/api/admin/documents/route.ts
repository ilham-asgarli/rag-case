import { type DocumentListResponse, documentListQuerySchema } from "@rag/contracts";
import { listDocuments } from "@rag/db";
import { NextResponse } from "next/server";
import { parseQuery, toErrorResponse } from "@/server/api";
import { requireAdmin } from "@/server/guards";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin();
    const query = parseQuery(request, documentListQuerySchema);
    return NextResponse.json<DocumentListResponse>(await listDocuments(query));
  } catch (error) {
    return toErrorResponse(error);
  }
}
