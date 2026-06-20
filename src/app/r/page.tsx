"use client";

import { useRouter } from "next/navigation";
import NicknamePrompt from "@/components/NicknamePrompt";
import { useNickname } from "@/hooks/useNickname";

export default function Page() {
  const router = useRouter();
  const { nickname, saveNickname } = useNickname();
  const createRoom = async () => {
    try {
      const userId = localStorage.getItem("userId");
      if (!userId || !nickname) return;

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, nickname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create room");
      router.push(`/r/${data.roomId}`);

    } catch (error) {
      console.error("Error", error);
    }
  };

  if (nickname === undefined) {
    return null;
  }

  if (nickname === null) {
    return (
      <NicknamePrompt
        onSubmit={saveNickname}
        submitLabel="Continue"
      />
    );
  }

  return <button onClick={createRoom}>create room</button>;
}
