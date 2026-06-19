"use client";

import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const createRoom = async () => {
    try {
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/room/create", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      router.push(`${window.location.origin}/r/${data.roomId}`);

    } catch (error) {
      console.error("Error", error);
    }
  };
  return <button onClick={createRoom}>create room</button>;
}
