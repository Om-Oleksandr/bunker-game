import { kv } from "@vercel/kv";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = nanoid(8);
    const room = {
      players: {
        [body.userId]: {
          cards: [],
          playedCards: [],
          isVotedOut: false,
          id: body.userId,
        },
      },
      currentTurn: body.userId,
      turnAvailableAt: null,
      activeCardPlay: null,
      roomSettings: {},
      bunkerCards: [],
      catastropheCards: [],
      createdAt: Date.now(),
      adminId: body.userId,
      phase: "idle",
      dealStartedAt: null,
    };

    await kv.set(`room:TlbK9VGA`, room);
    return Response.json({ roomId: "TlbK9VGA" }, { status: 201 });
  } catch (error) {
    console.error("Create room error", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
