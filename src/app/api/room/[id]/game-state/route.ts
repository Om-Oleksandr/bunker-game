import { IRoom, RoomGameState } from "@/types/common";
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
    const gameState: RoomGameState =
      body.gameState === "playing" ? "playing" : "idle";
    const room = await kv.get<IRoom>(`room:${id}`);

    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (room.adminId !== userId) {
      return Response.json(
        { error: "Only the room host can change the game state" },
        { status: 403 },
      );
    }

    room.gameState = gameState;
    if (gameState === "idle") {
      room.players = Object.fromEntries(
        Object.entries(room.players).map(([playerId, player]) => [
          playerId,
          {
            ...player,
            cards: [],
            playedCards: [],
            isVotedOut: false,
          },
        ]),
      );
      room.bunkerCards = [];
      room.catastropheCards = [];
      room.phase = "idle";
      room.dealStartedAt = null;
      room.currentTurn = "";
      room.activeCardPlay = null;
      room.turnAvailableAt = null;
      room.currentRound = 1;
      room.startingPlayerCount = 0;
      room.roundEndsAt = null;
      room.voting = null;
    }

    await kv.set(`room:${id}`, room);
    return Response.json({ data: { gameState } });
  } catch (error) {
    console.error("Game state error", error);
    return Response.json(
      { error: "Could not change game state" },
      { status: 500 },
    );
  }
}
