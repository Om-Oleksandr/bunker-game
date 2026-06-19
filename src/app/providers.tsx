"use client";

import { useEffect } from "react";
import { nanoid } from "nanoid";
import { getQueryClient } from "../lib/query-client";
import { QueryClientProvider } from "@tanstack/react-query";

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  useEffect(() => {
    const id = localStorage.getItem("userId");

    if (!id) {
      const newId = nanoid(18);
      localStorage.setItem("userId", newId);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
