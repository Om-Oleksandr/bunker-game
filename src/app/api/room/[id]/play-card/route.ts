import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";
import { NextRequest } from "next/server";

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

    const player = room.players[seatId];
    if (!player)
      return Response.json({ error: "Player not found" }, { status: 404 });

    const card = player.cards.find(({ id }) => id === cardId);

    if (!card)
      return Response.json({ error: "Card not found" }, { status: 404 });
    card.isPlayed = true;

    await kv.set(`room:${id}`, room);

    return Response.json({ data: { room } }, { status: 200 });
  } catch (error) {
    console.error("Play card error", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
