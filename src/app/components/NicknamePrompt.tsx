"use client";

import { SubmitEvent, useState } from "react";

export default function NicknamePrompt({
  onSubmit,
  submitLabel = "Доєднатись",
}: {
  onSubmit: (nickname: string) => void;
  submitLabel?: string;
}) {
  const [value, setValue] = useState("");
  const nickname = value.trim();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nickname) return;
    onSubmit(nickname);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/70 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg bg-white p-6 text-zinc-950 shadow-xl"
      >
        <label htmlFor="nickname" className="mb-2 block text-sm font-semibold">
          Введіть нік
        </label>
        <input
          id="nickname"
          autoFocus
          maxLength={24}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-full rounded-md border border-zinc-300 px-3 outline-none focus:border-zinc-700"
          autoComplete="nickname"
        />
        <button
          type="submit"
          disabled={!nickname}
          className="mt-4 h-11 w-full rounded-md bg-zinc-900 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
