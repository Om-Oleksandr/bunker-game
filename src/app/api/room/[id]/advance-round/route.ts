import { getVotingCount, TOTAL_ROUNDS } from "@/common/rounds";
import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const room = await kv.get<IRoom>(`room:${id}`);

    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    room.currentRound ??= 1;
    room.startingPlayerCount ??= Object.keys(room.players).length;
    room.roundEndsAt ??= null;
    room.voting ??= null;

    if (!room.roundEndsAt) {
      return Response.json({ data: { room, changed: false } });
    }
    if (Date.now() < room.roundEndsAt) {
      return Response.json(
        { error: "The final turn is still ending" },
        { status: 409 },
      );
    }

    const completedRound = room.currentRound;
    const activePlayers = Object.values(room.players).filter(
      ({ isVotedOut }) => !isVotedOut,
    );
    const scheduledEliminations = getVotingCount(
      room.startingPlayerCount,
      completedRound,
    );
    const eliminationsRequired = Math.min(
      scheduledEliminations,
      Math.max(activePlayers.length - 1, 0),
    );

    room.currentRound = Math.min(completedRound + 1, TOTAL_ROUNDS);
    room.roundEndsAt = null;
    room.turnAvailableAt = null;
    room.activeCardPlay = null;
    room.currentTurn = activePlayers[0]?.id ?? "";

    if (eliminationsRequired > 0) {
      room.phase = "voting";
      room.voting = {
        round: completedRound,
        eliminationsRequired,
        eliminationsCompleted: 0,
        ballots: {},
      };
    } else if (completedRound >= TOTAL_ROUNDS) {
      room.phase = "idle";
      room.gameState = "idle";
      room.voting = null;
    } else {
      room.phase = "showdown";
      room.voting = null;
    }

    await kv.set(`room:${id}`, room);
    return Response.json({ data: { room, changed: true } });
  } catch (error) {
    console.error("Advance round error", error);
    return Response.json(
      { error: "Could not advance round" },
      { status: 500 },
    );
  }
}
