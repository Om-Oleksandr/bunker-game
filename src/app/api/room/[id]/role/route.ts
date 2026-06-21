import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const userId = String(body.userId ?? "");
    const role = body.role === "player" ? "player" : "spectator";
    const room = await kv.get<IRoom>(`room:${id}`);

    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    room.spectators ??= {};
    room.gameState ??= "idle";

    if (room.gameState !== "idle") {
      return Response.json(
        { error: "Roles cannot be changed while the game is playing" },
        { status: 409 },
      );
    }

    const member = room.players[userId] ?? room.spectators[userId];
    if (!userId || !member) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    if (role === "player") {
      delete room.spectators[userId];
      room.players[userId] ??= {
        id: userId,
        nickname: member.nickname,
        cards: [],
        playedCards: [],
        isVotedOut: false,
      };
      if (!room.currentTurn) room.currentTurn = userId;
    } else {
      delete room.players[userId];
      room.spectators[userId] = {
        id: userId,
        nickname: member.nickname,
      };
      if (room.currentTurn === userId) {
        room.currentTurn =
          Object.values(room.players).find(({ isVotedOut }) => !isVotedOut)
            ?.id ?? "";
      }
    }

    await kv.set(`room:${id}`, room);
    return Response.json({ data: { role } });
  } catch (error) {
    console.error("Role change error", error);
    return Response.json({ error: "Could not change role" }, { status: 500 });
  }
}
