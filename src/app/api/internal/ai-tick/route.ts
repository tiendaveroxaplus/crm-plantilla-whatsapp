import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processNextAiJob } from "@/lib/ai-queue";

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET;
  const stamp = request.headers.get("x-worker-time") ?? "";
  const signature = request.headers.get("x-worker-signature") ?? "";
  if (!secret || !/^\d{10}$/.test(stamp) || Math.abs(Date.now() / 1000 - Number(stamp)) > 30 || !/^[a-f0-9]{64}$/.test(signature))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const expected = crypto.createHmac("sha256", secret).update(stamp).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex")))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ processed: await processNextAiJob() });
}
