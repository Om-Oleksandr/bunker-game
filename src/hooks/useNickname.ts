"use client";

import { useCallback, useSyncExternalStore } from "react";

const NICKNAME_KEY = "nickname";
const NICKNAME_CHANGE_EVENT = "nickname-change";

function getNicknameSnapshot() {
  const nickname = localStorage.getItem(NICKNAME_KEY)?.trim();
  return nickname || null;
}

function subscribeToNickname(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(NICKNAME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(NICKNAME_CHANGE_EVENT, onStoreChange);
  };
}

export function useNickname() {
  const nickname = useSyncExternalStore(
    subscribeToNickname,
    getNicknameSnapshot,
    () => null,
  );

  const saveNickname = useCallback((value: string) => {
    const nextNickname = value.trim();
    if (!nextNickname) return;

    localStorage.setItem(NICKNAME_KEY, nextNickname);
    window.dispatchEvent(new Event(NICKNAME_CHANGE_EVENT));
  }, []);

  return { nickname, saveNickname };
}
