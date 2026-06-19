export interface IPlayer {
  id: string;
  cards: { id: string; name: string; category: string; isPlayed: boolean }[];
  playedCards: { name: string; category: string }[];
  isVotedOut: boolean;
}

export type RoomPhase = "idle" | "dealing";

export interface IRoom {
  players: Record<string, IPlayer>;
  roomSettings: Record<string, unknown>;
  bunkerCards: string[];
  catastropheCards: string[];
  createdAt: number;
  adminId: string;
  phase: RoomPhase;
  dealStartedAt: number | null;
}
