"use client";

import { useNickname } from "@/hooks/useNickname";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const { nickname } = useNickname();
  const [open, setOpen] = useState(false);
  const router = useRouter();

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

  return (
    <div
      className="flex flex-col bg-cover bg-center flex-1 items-center justify-center bg-zinc-50 font-sans"
      style={{ backgroundImage: "url('/main.jpg')" }}
    >
      <main className="size-full">
        <div className="items-center justify-center flex gap-68 translate-y-full">
          {/* <Dialog>
            <DialogTrigger
              style={{
                background: "linear-gradient(135deg, #2c2520 0%, #161311 100%)",
                border: "3px solid #5c4738",
                color: "#ffb700",
                padding: "14px 32px",
                fontFamily: "'Impact', 'Arial Black', 'sans-serif'",
                fontSize: " 1.1rem",
                letterSpacing: "2px",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: "4px",
                position: "relative",
                boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.8), 0 0 15px rgba(255, 165, 0, 0.15),  0 4px 10px rgba(0, 0, 0, 0.5)",
                textShadow: "0 0 8px rgba(255, 170, 0, 0.6)",
                transition: "all 0.2s ease-in-out",
              }}
            >
              Join Room
            </DialogTrigger>
            <DialogContent
              style={{
                background: "linear-gradient(135deg, #2c2520 0%, #161311 100%)",
              }}
            >
              <DialogHeader>
                <DialogTitle>Enter room code</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete
                  your account and remove your data from our servers.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog> */}

          <button
            className="bunker-btn"
            onClick={createRoom}
            style={{
              background: "linear-gradient(135deg, #2c2520 0%, #161311 100%)",
              border: "3px solid #5c4738" /* Rust/iron colored border */,
              color: "#ffb700" /* Amber glow matching the overhead light */,
              padding: "14px 32px",
              fontFamily: "'Impact', 'Arial Black', 'sans-serif'",
              fontSize: " 1.1rem",
              letterSpacing: "2px",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: "4px",
              position: "relative",
              boxShadow: `inset 0 0 10px rgba(0, 0, 0, 0.8),
        0 0 15px rgba(255, 165, 0, 0.15),
        0 4px 10px rgba(0, 0, 0, 0.5)`,
              textShadow: "0 0 8px rgba(255, 170, 0, 0.6)",
              transition: "all 0.2s ease-in-out",
            }}
          >
            Create Room
          </button>
        </div>
      </main>
    </div>
  );
}
