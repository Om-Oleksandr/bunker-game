export interface IPlayer {
  id: string;
  nickname: string;
  cards: {
    id: string;
    name: string;
    category: string;
    isPlayed: boolean;
    playedOrder: number | null;
  }[];
  playedCards: { name: string; category: string }[];
  isVotedOut: boolean;
}

export type RoomPhase = "idle" | "dealing" | "showdown";

export interface IActiveCardPlay {
  seatId: string;
  cardId: string;
  name: string;
  category: string;
  slotIndex: number;
  startedAt: number;
  returnStartedAt: number;
  returnedAt: number;
}

export interface IRoom {
  players: Record<string, IPlayer>;
  roomSettings: Record<string, unknown>;
  bunkerCards: string[];
  catastropheCards: string[];
  createdAt: number;
  adminId: string;
  phase: RoomPhase;
  dealStartedAt: number | null;
  currentTurn: string;
  turnAvailableAt: number | null;
  activeCardPlay: IActiveCardPlay | null;
}
