import { APIRouteReturn } from "@/types/api";
import { IRoom } from "@/types/common";
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
    const userId = String(body.userId ?? "");
    const nickname = String(body.nickname ?? "").trim().slice(0, 24);

    if (!userId || !nickname) {
      return NextResponse.json(
        { error: "User ID and nickname are required" },
        { status: 400 },
      );
    }

    const room = await kv.get<IRoom>(`room:${id}`);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    room.spectators ??= {};
    room.gameState ??= "idle";

    if (room.players[userId]) {
      room.players[userId].nickname = nickname;
    } else {
      room.spectators[userId] = { id: userId, nickname };
    }

    await kv.set(`room:${id}`, room);

    return NextResponse.json(
      {
        data: {
          success: true,
          role: room.players[userId] ? "player" : "spectator",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Something wen wrong", error);
    return NextResponse.json({ error: "Couldn't join room" }, { status: 500 });
  }
}
