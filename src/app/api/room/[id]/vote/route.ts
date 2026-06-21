import { TOTAL_ROUNDS } from "@/common/rounds";
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
    const targetId = String(body.targetId ?? "");
    const room = await kv.get<IRoom>(`room:${id}`);

    if (!room) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (room.phase !== "voting" || !room.voting) {
      return Response.json({ error: "Voting is not active" }, { status: 409 });
    }

    const activePlayers = Object.values(room.players).filter(
      ({ isVotedOut }) => !isVotedOut,
    );
    if (!activePlayers.some(({ id: playerId }) => playerId === userId)) {
      return Response.json(
        { error: "Only active players can vote" },
        { status: 403 },
      );
    }
    if (
      targetId === userId ||
      !activePlayers.some(({ id: playerId }) => playerId === targetId)
    ) {
      return Response.json({ error: "Invalid vote target" }, { status: 400 });
    }
    if (room.voting.ballots[userId]) {
      return Response.json({ error: "You already voted" }, { status: 409 });
    }

    room.voting.ballots[userId] = targetId;
    let eliminatedPlayerId: string | null = null;

    if (Object.keys(room.voting.ballots).length >= activePlayers.length) {
      const totals = new Map<string, number>();
      Object.values(room.voting.ballots).forEach((votedPlayerId) => {
        totals.set(votedPlayerId, (totals.get(votedPlayerId) ?? 0) + 1);
      });
      eliminatedPlayerId = activePlayers.reduce((selected, player) => {
        const selectedVotes = selected ? totals.get(selected.id) ?? 0 : -1;
        const playerVotes = totals.get(player.id) ?? 0;
        return playerVotes > selectedVotes ? player : selected;
      }, activePlayers[0]).id;
      room.players[eliminatedPlayerId].isVotedOut = true;
      room.voting.eliminationsCompleted += 1;

      const remainingPlayers = activePlayers.filter(
        ({ id: playerId }) => playerId !== eliminatedPlayerId,
      );
      const votingFinished =
        room.voting.eliminationsCompleted >=
          room.voting.eliminationsRequired || remainingPlayers.length <= 1;

      if (votingFinished) {
        const completedRound = room.voting.round;
        room.voting = null;
        room.currentTurn = remainingPlayers[0]?.id ?? "";
        if (completedRound >= TOTAL_ROUNDS) {
          room.phase = "idle";
          room.gameState = "idle";
        } else {
          room.phase = "showdown";
        }
      } else {
        room.voting.ballots = {};
      }
    }

    await kv.set(`room:${id}`, room);
    return Response.json({
      data: { voting: room.voting, eliminatedPlayerId },
    });
  } catch (error) {
    console.error("Vote error", error);
    return Response.json({ error: "Could not submit vote" }, { status: 500 });
  }
}
