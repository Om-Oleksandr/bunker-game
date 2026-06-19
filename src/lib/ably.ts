// lib/ably.ts
"use client";

import * as Ably from "ably";

let ably: Ably.Realtime | null = null;

export function getAblyClient() {
  if (typeof window === "undefined") return null;

  if (!ably) {
    ably = new Ably.Realtime({
      key: process.env.NEXT_PUBLIC_ABLY_KEY!,
      clientId: 'ssj_id', // or your userId
    });
  }

  return ably;
}
