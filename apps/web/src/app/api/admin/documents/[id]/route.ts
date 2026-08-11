import { getDocumentDetail } from "@rag/db";
import { NextResponse } from "next/server";
import { errorResponse, toErrorResponse } from "@/server/api";
import { requireAdmin } from "@/server/guards";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireAdmin();
    // Next 16: params is async.
    const { id } = await context.params;
    const detail = await getDocumentDetail(id);
    if (!detail) return errorResponse("not_found", "No such document.");
    return NextResponse.json(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}
