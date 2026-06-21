import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";
import { NextRequest } from "next/server";

const SKIPPED_RETURN_DURATION = 500;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId } = await req.json();
    const room = await kv.get<IRoom>(`room:${id}`);

    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    room.gameState ??= "idle";
    if (room.gameState !== "playing") {
      return Response.json({ error: "The game is not playing" }, { status: 409 });
    }

    const activePlay = room.activeCardPlay;
    const player = room.players[String(userId ?? "")];
    const playedCard = player?.cards.find(
      ({ id: cardId, isPlayed }) =>
        cardId === activePlay?.cardId && isPlayed,
    );

    if (!activePlay || activePlay.seatId !== userId || !playedCard) {
      return Response.json(
        { error: "Only the player who played the active card can skip" },
        { status: 403 },
      );
    }

    const now = Date.now();
    if (now >= activePlay.returnStartedAt) {
      return Response.json(
        { error: "This turn is already ending" },
        { status: 409 },
      );
    }

    activePlay.returnStartedAt = now;
    activePlay.returnedAt = now + SKIPPED_RETURN_DURATION;
    room.turnAvailableAt = activePlay.returnedAt;

    await kv.set(`room:${id}`, room);

    return Response.json(
      { data: { play: activePlay, turnAvailableAt: room.turnAvailableAt } },
      { status: 200 },
    );
  } catch (error) {
    console.error("Skip turn error", error);
    return Response.json({ error: "Could not skip turn" }, { status: 500 });
  }
}
