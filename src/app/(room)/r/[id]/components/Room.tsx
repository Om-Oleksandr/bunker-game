"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getRoomQuery, joinRoomMutationOptions } from "../queries";
import { getAblyClient } from "@/lib/ably";
import RoomTable, { RoomTableHandle } from "./RoomTable";
import { InboundMessage } from "ably";
import { updateRoom } from "@/app/actions/kv";
import { nanoid } from "nanoid";

import { useNickname } from "@/hooks/useNickname";
import NicknamePrompt from "@/app/components/NicknamePrompt";

export default function Room({ roomId }: { roomId: string }) {
  const { nickname, saveNickname } = useNickname();
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

  const { mutateAsync, error: joinError } = useMutation(
    joinRoomMutationOptions({}),
  );
  const { data: room, refetch } = useQuery(getRoomQuery({ id: roomId }));

  const tableRef = useRef<RoomTableHandle | null>(null);
  const animatedDealStartedAtRef = useRef<number | null>(null);
  const advancingRoundEndsAtRef = useRef<number | null>(null);

  const mutateStore = useCallback(async () => {
    if (!room || !userId || !nickname) return;
    const existingMember =
      room.players[userId] ?? room.spectators?.[userId];
    if (existingMember?.nickname === nickname) return;

    await mutateAsync({ userId, nickname, roomId });
    await refetch();
    await channel?.publish("player-joined", { userId, nickname });
  }, [channel, mutateAsync, nickname, refetch, room, roomId, userId]);

  useEffect(() => {
    void mutateStore().catch((error) => {
      console.error("Failed to join room", error);
    });
  }, [mutateStore]);

  useEffect(() => {
    if (!channel) return;

    const onCardPlayed = (msg: InboundMessage) => {
      tableRef.current?.animateCardPlay(msg.data);
      refetch();
    };

    const onPlayerJoined = () => {
      refetch();
    };

    channel.subscribe("player-joined", onPlayerJoined);
    channel.subscribe("role-changed", onPlayerJoined);
    channel.subscribe("game-state-changed", onPlayerJoined);

    channel.subscribe("deal-start", async () => {
      await refetch();
    });
    channel.subscribe("room-updated", async () => {
      await refetch();
    });

    channel.subscribe("bunker-card-revealed", onPlayerJoined);

    channel.subscribe("card-played", onCardPlayed);

    channel.subscribe("turn-skipped", async (message: InboundMessage) => {
      await refetch();
      await tableRef.current?.animateSkippedCardReturn(message.data.play);
    });

    channel.subscribe("round-advanced", onPlayerJoined);
    channel.subscribe("vote-updated", onPlayerJoined);

    channel.subscribe("cards-dealed", () => console.log("cards dealt"));

    return () => {
      channel.unsubscribe();
    };
  }, [channel, refetch]);

  useEffect(() => {
    const roundEndsAt = room?.roundEndsAt;
    if (!roundEndsAt || !channel) return;
    if (advancingRoundEndsAtRef.current === roundEndsAt) return;

    advancingRoundEndsAtRef.current = roundEndsAt;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/room/${roomId}/advance-round`, {
          method: "POST",
        });
        const json: { data?: { changed: boolean }; error?: string } =
          await response.json();
        if (!response.ok || !json.data) {
          throw new Error(json.error ?? "Could not advance round");
        }
        await channel.publish("round-advanced", {
          roundEndsAt,
          changed: json.data.changed,
        });
        await refetch();
      } catch (error) {
        advancingRoundEndsAtRef.current = null;
        console.error("Failed to advance round", error);
      }
    }, Math.max(roundEndsAt - Date.now(), 0) + 75);

    return () => window.clearTimeout(timeout);
  }, [channel, refetch, room?.roundEndsAt, roomId]);

  useEffect(() => {
    if (!room || !userId) return;
    if (!room.dealStartedAt) return;
    if (room.phase !== "dealing") return;
    if (animatedDealStartedAtRef.current === room.dealStartedAt) return;

    animatedDealStartedAtRef.current = room.dealStartedAt;
    const startedAt = room.dealStartedAt;
    requestAnimationFrame(() => {
      void tableRef.current
        ?.startDealAnimationFromOffset(startedAt)
        .then(async (completed) => {
          if (!completed) {
            animatedDealStartedAtRef.current = null;
            return;
          }
          if (room.adminId !== userId) return;

          await updateRoom(roomId, room, {
            phase: "idle",
            dealStartedAt: null,
          });
          await channel?.publish("room-updated", { phase: "idle" });
          await refetch();
        });
    });
  }, [room, userId, roomId, channel, refetch]);

  if (!room || !channel || !userId) {
    return <>loading</>;
  }

  if (nickname === null) {
    return <NicknamePrompt onSubmit={saveNickname} submitLabel="Continue" />;
  }

  if (!room.players[userId] && !room.spectators?.[userId]) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,#263b32,#070c0a)] px-6 text-center text-[#f2e8d2]">
        <div>
          <div className="mx-auto mb-5 size-10 animate-spin rounded-full border-2 border-[#665b49] border-t-[#e8a52b]" />
          <p className="text-xs font-black tracking-[0.18em] text-[#e8a52b] uppercase">
            {joinError ? "Could not join the room" : "Entering the bunker"}
          </p>
          <p className="mt-2 text-sm text-[#9f9584]">
            {joinError
              ? "Please refresh the page and try again."
              : "Preparing your seat…"}
          </p>
        </div>
      </div>
    );
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
