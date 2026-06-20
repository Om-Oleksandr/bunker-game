import { GETJoinRoom } from "@/app/api/room/[id]/join/route";
import { GETRoom } from "@/app/api/room/[id]/route";
import { MutationConfig, QueryConfig } from "@/types/api";
import { IRoom } from "@/types/common";
import { mutationOptions, queryOptions } from "@tanstack/react-query";

type JoinRoomPayload = {
  roomId: string;
  userId: string;
  nickname: string;
  newRoom: IRoom;
};

export type RoomData = Awaited<ReturnType<typeof getRoom>>;

async function joinRoom({
  roomId,
  userId,
  nickname,
  newRoom,
}: JoinRoomPayload) {
  const res = await fetch(`/api/room/${roomId}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roomId,
      userId,
      nickname,
      newRoom,
    }),
  });
  const json: GETJoinRoom = await res.json();

  if ("error" in json) {
    throw Error(json.error);
  }

  const { data } = json;

  return data;
}

export function joinRoomMutationOptions({
  ...mutationConfig
}: MutationConfig<typeof joinRoom>) {
  return mutationOptions({
    ...mutationConfig,
    mutationFn: (data: JoinRoomPayload) => joinRoom(data),
  });
}

async function getRoom({
  roomId,
  signal,
}: {
  roomId: string | null;
  signal?: AbortSignal;
}) {
  const res = await fetch(`/api/room/${roomId}`, { signal });
  const json: GETRoom = await res.json();

  if ("error" in json) {
    throw Error(json.error);
  }

  const { data } = json;

  return data;
}

export function getRoomQuery<TData = RoomData>({
  id,
  ...queryConfig
}: { id: string | null } & QueryConfig<typeof getRoom, TData>) {
  return queryOptions({
    ...queryConfig,
    queryKey: ["/api/room", id],
    queryFn: ({ signal }) => getRoom({ roomId: id, signal }),
  });
}
