import { kv } from "@vercel/kv";
import Room from "./components/Room";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const room = await kv.get(`room:${id}`);

  if (!room) notFound();

  return <Room roomId={id} />;
}
