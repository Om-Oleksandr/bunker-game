'use server'

import { IRoom } from "@/types/common";
import { kv } from "@vercel/kv";

export async function updateRoom(
  roomId: string,
  room: IRoom,
  update: Partial<IRoom>,
) {
  await kv.set(`room:${roomId}`, { ...room, ...update });
}
