"use client";

import { useRouter } from "next/navigation";
import NicknamePrompt from "@/app/components/NicknamePrompt";
import { useNickname } from "@/hooks/useNickname";

export default function Page() {
  const { nickname, saveNickname } = useNickname();
 

  if (nickname === undefined) {
    return null;
  }

  if (nickname === null) {
    return <NicknamePrompt onSubmit={saveNickname} submitLabel="Continue" />;
  }

  return null;
}
