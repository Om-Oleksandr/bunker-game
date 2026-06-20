import { IRoom } from "@/types/common";
import { cloneDeep } from "es-toolkit";
import { NextRequest } from "next/server";
import player_cards from "@/cards/bunker_data.json";
import { kv } from "@vercel/kv";
import { nanoid } from "nanoid";

const DEAL_START_BUFFER = 750;

function drawFromCategory(deck: string[]) {
  const index = Math.floor(Math.random() * deck.length);
  const [card] = deck.splice(index, 1);
  return card;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId, room } = body;
    const { players } = room as IRoom;
    const updated = structuredClone(players);

    const copiedCards = cloneDeep(player_cards);
    for (const player of Object.values(updated)) {
      player.cards = [];
      player.playedCards = [];

      for (const category of Object.keys(copiedCards)) {
        const deck = copiedCards[category as keyof typeof copiedCards];

        if (deck.length === 0) continue;

        const cardName = drawFromCategory(deck);

        player.cards.push({
          id: nanoid(9),
          name: cardName,
          category,
          isPlayed: false,
          playedOrder: null,
        });
      }
    }

    const newRoom = structuredClone(room);
    newRoom.players = updated;
    newRoom.phase = "dealing";
    newRoom.dealStartedAt = Date.now() + DEAL_START_BUFFER;
    newRoom.activeCardPlay = null;
    newRoom.turnAvailableAt = null;

    await kv.set(`room:${roomId}`, newRoom);

    return Response.json(
      { data: { room: newRoom, dealStartedAt: newRoom.dealStartedAt } },
      { status: 200 },
    );
  } catch (error) {
    console.log("Card dealing error", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
