import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isLimited, recordHit } from "@/lib/ratelimit";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createTxn, createGroupExpense, createSettlement } from "@/lib/ops";

type Op =
  | { kind: "txn"; clientId: string; data: unknown }
  | { kind: "groupExpense"; clientId: string; groupId: string; data: unknown }
  | { kind: "settlement"; clientId: string; groupId: string; data: unknown };

/** Replays queued offline operations. Each result is independent so one bad op never blocks the rest. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Cap request size and rate so a stolen session or a buggy client can't flood the database.
  if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const rlKey = `sync:${user.id}`;
  if (isLimited(rlKey, 120, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  recordHit(rlKey, 60_000);
  const body = (await req.json().catch(() => null)) as { ops?: Op[] } | null;
  if (!body || !Array.isArray(body.ops) || body.ops.length > 50) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { ops } = body as { ops: Op[] };
  const results: { clientId: string; ok: boolean; error?: string }[] = [];

  for (const op of ops ?? []) {
    try {
      if (op.kind === "txn") {
        await createTxn(user.id, op.clientId, op.data);
      } else {
        const member = await db.member.findFirst({ where: { groupId: op.groupId, userId: user.id, left: false } });
        if (!member) throw new Error("Not a member of this group");
        const actor = { id: user.id, name: user.name };
        if (op.kind === "groupExpense") await createGroupExpense(actor, op.groupId, op.clientId, op.data);
        else await createSettlement(actor, op.groupId, op.clientId, op.data);
      }
      results.push({ clientId: op.clientId, ok: true });
    } catch (e) {
      const error =
        e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") : e instanceof Error ? e.message : "Failed";
      results.push({ clientId: op.clientId, ok: false, error });
    }
  }
  return NextResponse.json({ results });
}
