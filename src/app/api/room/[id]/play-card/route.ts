import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";
import { NextRequest } from "next/server";

const PLAY_TRAVEL_DURATION = 450;
const PLAY_FLIP_DURATION = 300;
const EXPLANATION_DURATION = 30_000;
const PLAY_RETURN_DURATION = 450;
const TURN_PAUSE_DURATION = 5_000;

export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/room/[id]/play-card">,
) {
  try {
    const { id } = await params;
    const { seatId, cardId } = await req.json();

    const room = await kv.get<IRoom>(`room:${id}`);
    if (!room)
      return Response.json({ error: "Room not found" }, { status: 404 });

    room.gameState ??= "idle";
    if (room.gameState !== "playing") {
      return Response.json(
        { error: "The game is not playing" },
        { status: 409 },
      );
    }

    room.currentTurn ??= Object.keys(room.players)[0] ?? "";
    room.turnAvailableAt ??= null;
    room.activeCardPlay ??= null;
    room.currentRound ??= 1;
    room.startingPlayerCount ??= Object.keys(room.players).length;
    room.roundEndsAt ??= null;
    room.voting ??= null;

    if (room.phase === "voting" || room.voting) {
      return Response.json(
        { error: "Voting must finish before the next round" },
        { status: 409 },
      );
    }

    const player = room.players[seatId];
    if (!player)
      return Response.json({ error: "Player not found" }, { status: 404 });
    const card = player.cards.find(({ id }) => id === cardId);

    if (!card)
      return Response.json({ error: "Card not found" }, { status: 404 });

    if (room.currentTurn !== seatId) {
      return Response.json({ error: "It is not your turn" }, { status: 409 });
    }

    if (room.turnAvailableAt && Date.now() < room.turnAvailableAt) {
      return Response.json(
        { error: "The next turn has not started yet" },
        { status: 409 },
      );
    }

    if (card.isPlayed) {
      return Response.json({ error: "Card already played" }, { status: 409 });
    }

    const playerIds = Object.values(room.players)
      .filter(({ isVotedOut }) => !isVotedOut)
      .map(({ id }) => id);
    const playerIndex = playerIds.indexOf(seatId);
    const nextPlayerId = playerIds[(playerIndex + 1) % playerIds.length];
    const endsRound = playerIndex === playerIds.length - 1;
    const startedAt = Date.now();
    const returnStartedAt =
      startedAt +
      PLAY_TRAVEL_DURATION +
      PLAY_FLIP_DURATION +
      EXPLANATION_DURATION;
    const returnedAt = returnStartedAt + PLAY_RETURN_DURATION;
    const previouslyPlayedCards = player.cards.filter(
      ({ isPlayed }) => isPlayed,
    );
    previouslyPlayedCards.forEach((playedCard, index) => {
      playedCard.playedOrder ??= index;
    });
    const slotIndex = previouslyPlayedCards.length;

    card.isPlayed = true;
    card.playedOrder = slotIndex;
    room.phase = "showdown";
    room.currentTurn = nextPlayerId;
    room.turnAvailableAt = returnedAt + TURN_PAUSE_DURATION;
    room.roundEndsAt = endsRound ? room.turnAvailableAt : null;
    room.activeCardPlay = {
      seatId,
      cardId,
      name: card.name,
      category: card.category,
      slotIndex,
      startedAt,
      returnStartedAt,
      returnedAt,
      endsRound,
    };

    await kv.set(`room:${id}`, room);

    return Response.json(
      { data: { room, play: room.activeCardPlay } },
      { status: 200 },
    );
  } catch (error) {
    console.error("Play card error", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
