import { APIRouteReturn } from "@/types/api";
import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export type GETJoinRoom = APIRouteReturn<typeof POST>;

export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/room/[id]/join">,
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { newRoom } = body;

    await kv.set(`room:${id}`, newRoom);

    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (error) {
    console.error("Something wen wrong", error);
    return NextResponse.json({ error: "Couldn't join room" }, { status: 500 });
  }
}
