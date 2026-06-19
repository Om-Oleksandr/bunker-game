"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getRoomQuery, joinRoomMutationOptions } from "../queries";
import { cloneDeep } from "es-toolkit";
import { getAblyClient } from "@/lib/ably";
import RoomTable, { RoomTableHandle } from "./RoomTable";
import { InboundMessage } from "ably";
import { updateRoom } from "@/app/actions/kv";
import { nanoid } from "nanoid";

export default function Room({ roomId }: { roomId: string }) {
  const ably = getAblyClient();
  const channel = ably?.channels.get(`room:${roomId}`);
  const [userId] = useState(() => {
    if (typeof window === "undefined") return null;

    let storedUserId = localStorage.getItem("userId");

    if (!storedUserId) {
      storedUserId = nanoid(18);
      localStorage.setItem("userId", storedUserId);
    }

    return storedUserId;
  });

  const { mutateAsync } = useMutation(joinRoomMutationOptions({}));
  const { data: room, refetch } = useQuery(getRoomQuery({ id: roomId }));

  const tableRef = useRef<RoomTableHandle | null>(null);
  const animatedDealStartedAtRef = useRef<number | null>(null);

  const mutateStore = useCallback(async () => {
    if (!room || !userId || room.players[userId]) return;
    const player = {
      id: userId,
      cards: [],
      revealedCards: [],
      isVotedOut: false,
    };
    const newRoom = cloneDeep(room);
    newRoom.players = { ...room.players, [userId]: player };

    await mutateAsync({ userId, roomId, newRoom });
    channel?.publish("player-joined", { userId });
  }, [channel, mutateAsync, room, roomId, userId]);

  useEffect(() => {
    mutateStore();
  }, [mutateStore]);

  useEffect(() => {
    if (!channel) return;

    const onCardPlayed = (msg: InboundMessage) => {
      console.log("card played:", msg.data);
    };

    const onPlayerJoined = () => {
      refetch();
    };

    channel.subscribe("player-joined", onPlayerJoined);

    channel.subscribe("deal-start", async () => {
      await refetch();
    });
    channel.subscribe("room-updated", async () => {
      await refetch();
    });

    channel.subscribe("bunker-card-start", () => console.log("cards dealt"));
    channel.subscribe("catastrophe-card-start", () =>
      console.log("cards dealt"),
    );

    channel.subscribe("bunker-card-revealed", () => console.log("cards dealt"));
    channel.subscribe("catastrophe-card-revealed", () =>
      console.log("cards dealt"),
    );

    channel.subscribe("card-played", onCardPlayed);

    channel.subscribe("round-end", onCardPlayed);

    channel.subscribe("vote-start", onCardPlayed);
    channel.subscribe("player-vote", onCardPlayed);
    channel.subscribe("vote-end", onCardPlayed);

    channel.subscribe("cards-dealed", () => console.log("cards dealt"));
    channel.presence.enter({ name: "player1" });

    return () => {
      channel.presence.leave();
      channel.unsubscribe();
    };
  }, [roomId, room, channel, refetch]);

  useEffect(() => {
    if (!room || !userId) return;
    if (!room.dealStartedAt) return;
    if (room.phase !== "dealing") return;
    if (animatedDealStartedAtRef.current === room.dealStartedAt) return;

    animatedDealStartedAtRef.current = room.dealStartedAt;
    const startedAt = room.dealStartedAt;
    requestAnimationFrame(() => {
      void tableRef.current?.startDealAnimationFromOffset(startedAt).then(
        async () => {
          if (room.adminId !== userId) return;

          await updateRoom(roomId, room, {
            phase: "idle",
            dealStartedAt: null,
          });
          await channel?.publish("room-updated", { phase: "idle" });
          await refetch();
        },
      );
    });
  }, [room, userId, roomId, channel, refetch]);

  if (!room || !channel || !userId) {
    return <>loading</>;
  }

  return (
    <div>
      <RoomTable
        ref={tableRef}
        room={room!}
        roomId={roomId}
        userId={userId!}
        channel={channel}
      />
    </div>
  );
}
