import { APIRouteReturn } from "@/types/api";
import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

export type GETRoom = APIRouteReturn<typeof GET>;

export async function GET(
  req: NextRequest,
  { params }: RouteContext<"/api/room/[id]">,
) {
  try {
    const { id } = await params;
    const room: IRoom | null = await kv.get(`room:${id}`);

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({ data: room });
  } catch (error) {
    console.error("Something went wrong", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
