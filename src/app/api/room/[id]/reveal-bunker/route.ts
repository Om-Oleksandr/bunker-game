import { IRoom, ITableCard } from "@/types/common";
import { kv } from "@vercel/kv";
import { NextRequest } from "next/server";

function normalizeCard(card: ITableCard | string, index: number): ITableCard {
  return typeof card === "string"
    ? {
        id: `legacy-bunker-${index}`,
        name: card,
        isRevealed: false,
        revealedAt: null,
        revealedRound: null,
      }
    : card;
}

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
    if (room.adminId !== userId) {
      return Response.json(
        { error: "Only the table admin can reveal bunker cards" },
        { status: 403 },
      );
    }
    if (room.gameState !== "playing" || room.phase === "dealing") {
      return Response.json(
        { error: "Bunker cards can only be revealed during the game" },
        { status: 409 },
      );
    }
    if (room.voting) {
      return Response.json(
        { error: "Finish voting before revealing the next round card" },
        { status: 409 },
      );
    }

    room.currentRound ??= 1;
    room.bunkerCards = (room.bunkerCards ?? []).map(normalizeCard);
    if (
      room.bunkerCards.some(
        ({ revealedRound }) => revealedRound === room.currentRound,
      )
    ) {
      return Response.json(
        { error: "A bunker card is already open for this round" },
        { status: 409 },
      );
    }

    const hiddenCards = room.bunkerCards.filter(({ isRevealed }) => !isRevealed);
    if (hiddenCards.length === 0) {
      return Response.json(
        { error: "No bunker cards remain" },
        { status: 409 },
      );
    }
    const card = hiddenCards[Math.floor(Math.random() * hiddenCards.length)];

    card.isRevealed = true;
    card.revealedAt = Date.now();
    card.revealedRound = room.currentRound;
    await kv.set(`room:${id}`, room);

    return Response.json({ data: { card, round: room.currentRound } });
  } catch (error) {
    console.error("Reveal bunker card error", error);
    return Response.json(
      { error: "Could not reveal bunker card" },
      { status: 500 },
    );
  }
}
