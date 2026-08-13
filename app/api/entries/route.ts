import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../db";
import { healthEntries } from "../../../db/schema";

const allowedTypes = new Set(["sleep", "meal", "exercise", "water"]);

async function getUserId() {
  return (await headers()).get("oai-authenticated-user-id") ?? "local-user";
}

export async function GET() {
  try {
    const db = getDb();
    const entries = await db.select().from(healthEntries).where(eq(healthEntries.userId, await getUserId())).orderBy(desc(healthEntries.recordedAt), desc(healthEntries.id)).limit(60);
    return Response.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load health records";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { type?: string; value?: number; unit?: string; note?: string };
    if (!payload.type || !allowedTypes.has(payload.type) || typeof payload.value !== "number" || payload.value < 0 || !payload.unit) {
      return Response.json({ error: "Invalid health record" }, { status: 400 });
    }
    const db = getDb();
    const [entry] = await db.insert(healthEntries).values({ userId: await getUserId(), type: payload.type as "sleep" | "meal" | "exercise" | "water", value: payload.value, unit: payload.unit.slice(0, 12), note: payload.note?.trim().slice(0, 160) ?? "" }).returning();
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save health record";
    return Response.json({ error: message }, { status: 500 });
  }
}
