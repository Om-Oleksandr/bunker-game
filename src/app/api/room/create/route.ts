import { kv } from "@vercel/kv";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = nanoid(8);
    const userId = String(body.userId ?? "");
    const nickname = String(body.nickname ?? "")
      .trim()
      .slice(0, 24);

    if (!userId || !nickname) {
      return Response.json(
        { error: "User ID and nickname are required" },
        { status: 400 },
      );
    }

    const room = {
      players: {
        [userId]: {
          cards: [],
          playedCards: [],
          isVotedOut: false,
          id: userId,
          nickname,
        },
      },
      currentTurn: userId,
      turnAvailableAt: null,
      activeCardPlay: null,
      roomSettings: {},
      bunkerCards: [],
      catastropheCards: [],
      createdAt: Date.now(),
      adminId: userId,
      phase: "idle",
      dealStartedAt: null,
    };

    await kv.set(`room:${id}`, room);
    return Response.json({ roomId: id }, { status: 201 });
  } catch (error) {
    console.error("Create room error", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
