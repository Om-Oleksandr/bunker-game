export const TOTAL_ROUNDS = 5;

export function getVotingCount(playerCount: number, round: number) {
  const count = Math.min(Math.max(playerCount, 4), 16);

  if (round === 2) return count >= 7 ? 1 : 0;
  if (round === 3) return count >= 13 ? 2 : count >= 5 ? 1 : 0;
  if (round === 4) return count >= 11 ? 2 : 1;
  if (round === 5) return count >= 9 ? 2 : 1;
  return 0;
}
