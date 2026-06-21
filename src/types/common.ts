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

export interface ISpectator {
  id: string;
  nickname: string;
}

export type RoomPhase = "idle" | "dealing" | "showdown" | "voting";
export type RoomGameState = "idle" | "playing";

export interface IActiveCardPlay {
  seatId: string;
  cardId: string;
  name: string;
  category: string;
  slotIndex: number;
  startedAt: number;
  returnStartedAt: number;
  returnedAt: number;
  endsRound: boolean;
}

export interface IVotingState {
  round: number;
  eliminationsRequired: number;
  eliminationsCompleted: number;
  ballots: Record<string, string>;
}

export interface IRoom {
  players: Record<string, IPlayer>;
  spectators: Record<string, ISpectator>;
  gameState: RoomGameState;
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
  currentRound: number;
  startingPlayerCount: number;
  roundEndsAt: number | null;
  voting: IVotingState | null;
}
