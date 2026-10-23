import { StudioError, validateRequest } from "@/lib/studio/contracts";
import { runGeneration } from "@/lib/studio/service";

export const runtime = "nodejs";
export const maxDuration = 150;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new StudioError("INVALID_ORIGIN", "Generate from this workspace page.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new StudioError("INVALID_INPUT", "Use the Image Studio form.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new StudioError("INVALID_INPUT", "Enter your generation settings.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 7_100_000) { await reader.cancel(); throw new StudioError("TOO_LARGE", "Use a reference image up to 5 MB.", 413); }
      chunks.push(value);
    }
    let data: unknown;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new StudioError("INVALID_INPUT", "Check your generation settings."); }
    const input = validateRequest(data);
    const asset = await runGeneration(input);
    return Response.json({ job: { id: input.requestId, status: "succeeded", asset } }, { headers });
  } catch (error) {
    const safe = error instanceof StudioError ? error : new StudioError("UNAVAILABLE", "Image generation is unavailable. Please try later.", 503);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: { ...headers, ...(safe.status === 429 ? { "Retry-After": "10" } : {}) } });
  }
}
