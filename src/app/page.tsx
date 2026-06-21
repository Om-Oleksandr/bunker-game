"use client";

import { useNickname } from "@/hooks/useNickname";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { Input } from "@/modules/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/modules/components/ui/dialog";

export default function Home() {
  const { nickname } = useNickname();
  const router = useRouter();
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const joinRequestRef = useRef<AbortController | null>(null);

  const setJoinDialogOpen = (open: boolean) => {
    setIsJoinOpen(open);
    if (!open) {
      joinRequestRef.current?.abort();
      joinRequestRef.current = null;
      setRoomId("");
      setJoinError("");
      setIsCheckingRoom(false);
    }
  };

  const joinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) {
      setJoinError("Enter a room ID.");
      return;
    }

    setJoinError("");
    setIsCheckingRoom(true);
    const controller = new AbortController();
    joinRequestRef.current = controller;

    try {
      const response = await fetch(
        `/api/room/${encodeURIComponent(normalizedRoomId)}`,
        { signal: controller.signal },
      );

      if (response.status === 404) {
        setJoinError("A room with this ID doesn’t exist.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to check room");
      }

      router.push(`/r/${encodeURIComponent(normalizedRoomId)}`);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Join room error", error);
      setJoinError("Couldn’t check the room. Please try again.");
    } finally {
      if (joinRequestRef.current === controller) {
        joinRequestRef.current = null;
        setIsCheckingRoom(false);
      }
    }
  };

  const createRoom = async () => {
    try {
      const userId = localStorage.getItem("userId");
      if (!userId) return;

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
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 bg-[url('/main.jpg')] bg-cover bg-center font-sans">
      <main className="size-full">
        <div className="items-center justify-center flex gap-42 translate-y-full">
          <Dialog open={isJoinOpen} onOpenChange={setJoinDialogOpen}>
            <DialogTrigger className="relative cursor-pointer rounded-[4px] border-[3px] border-solid border-[#5c4738] bg-[linear-gradient(135deg,#2c2520_0%,#161311_100%)] px-8 py-[14px] font-['Impact','Arial_Black',sans-serif] text-[1.1rem] tracking-[2px] text-[#ffb700] uppercase shadow-[inset_0_0_10px_rgba(0,0,0,0.8),0_0_15px_rgba(255,165,0,0.15),0_4px_10px_rgba(0,0,0,0.5)] [text-shadow:0_0_8px_rgba(255,170,0,0.6)] transition-all duration-200 ease-in-out">
              Доєднатись
            </DialogTrigger>
            <DialogContent className="overflow-hidden font-mono border-2 border-[#66503d] bg-[linear-gradient(145deg,rgba(40,34,29,0.98),rgba(14,12,11,0.98))] p-0 text-[#f4e5c3] shadow-[inset_0_0_35px_rgba(0,0,0,0.65),0_24px_70px_rgba(0,0,0,0.7),0_0_24px_rgba(255,170,0,0.12)] ring-1 ring-[#b88a55]/30 sm:max-w-md">
              <form onSubmit={joinRoom} noValidate>
                <div className="h-1 bg-[linear-gradient(90deg,transparent,#ffb700,transparent)] opacity-70" />
                <div className="p-6 sm:p-7">
                  <DialogHeader className="gap-2 text-left">
                    <DialogTitle className="text-xl font-black tracking-[0.12em] text-[#ffb700] uppercase [text-shadow:0_0_12px_rgba(255,183,0,0.35)]">
                      Доєднатись до кімнати
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-[#c8b99d]">
                      Введіть ID кімнати
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-6">
                    <label
                      htmlFor="room-id"
                      className="mb-2 block text-xs font-bold tracking-[0.16em] text-[#d8c7a6] uppercase"
                    >
                      ID кімнати
                    </label>
                    <Input
                      id="room-id"
                      autoFocus
                      autoComplete="off"
                      maxLength={64}
                      spellCheck={false}
                      placeholder="Приклад: V1StGXR8"
                      value={roomId}
                      onChange={(event) => {
                        setRoomId(event.target.value);
                        if (joinError) setJoinError("");
                      }}
                      aria-invalid={Boolean(joinError)}
                      aria-describedby={joinError ? "room-id-error" : undefined}
                      className="h-12 rounded-md border-[#75604a] bg-black/35 px-3 text-base tracking-[0.08em] text-[#fff2d0] placeholder:text-[#756b5b] focus-visible:border-[#ffb700] focus-visible:ring-[#ffb700]/20 aria-invalid:border-[#e85d4a] aria-invalid:ring-[#e85d4a]/20"
                    />
                    {joinError && (
                      <p
                        id="room-id-error"
                        role="alert"
                        className="mt-2 text-sm font-medium text-[#ff7b68]"
                      >
                        {joinError}
                      </p>
                    )}
                  </div>
                </div>

                <DialogFooter className="m-0 flex-row justify-end gap-3 rounded-none border-[#554334] bg-black/25 px-6 py-4 sm:px-7">
                  <button
                    type="button"
                    onClick={() => setJoinDialogOpen(false)}
                    className="h-10 rounded-md border border-[#655343] bg-transparent px-5 text-sm font-bold tracking-wider text-[#d7c8ad] uppercase transition-colors hover:bg-white/5"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={isCheckingRoom}
                    className="h-10 min-w-24 rounded-md border border-[#d49400] bg-[linear-gradient(180deg,#ffbd1f,#d88a00)] px-5 text-sm font-black tracking-wider text-[#21170a] uppercase shadow-[0_0_15px_rgba(255,183,0,0.2)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isCheckingRoom ? "Перевірка…" : "Доєднатись"}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <button
            className="bunker-btn relative cursor-pointer rounded-[4px] border-[3px] border-solid border-[#5c4738] bg-[linear-gradient(135deg,#2c2520_0%,#161311_100%)] px-8 py-[14px] font-['Impact','Arial_Black',sans-serif] text-[1.1rem] tracking-[2px] text-[#ffb700] uppercase shadow-[inset_0_0_10px_rgba(0,0,0,0.8),0_0_15px_rgba(255,165,0,0.15),0_4px_10px_rgba(0,0,0,0.5)] [text-shadow:0_0_8px_rgba(255,170,0,0.6)] transition-all duration-200 ease-in-out"
            onClick={createRoom}
          >
            Створити кімнату
          </button>
        </div>
      </main>
    </div>
  );
}
