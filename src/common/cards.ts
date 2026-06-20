export const CARD_WIDTH = 90;
export const CARD_HEIGHT = 120;

export const CARD_GAP = 6;

export const CARDS_PER_PLAYER = 7;

export const DEAL_DURATION = 800;
export const DEAL_STAGGER = 300;

export const SPREAD_DURATION = 600;

export const FLIP_DURATION = 400;
export const FLIP_STAGGER = 80;

export const OPPONENT_OFFSET_Y = -110;

export const OPPONENT_HAND_OFFSET_Y = -70;
export const OPPONENT_CARD_OFFSET_X = -20;
export const OPPONENT_CARD_SCALE = 0.50;

export function getTotalAnimationDuration(playerCount: number): number {
  const dealDuration =
    DEAL_STAGGER * (CARDS_PER_PLAYER * playerCount - 1) + DEAL_DURATION;
  return (
    dealDuration +
    SPREAD_DURATION +
    FLIP_STAGGER * (CARDS_PER_PLAYER - 1) +
    FLIP_DURATION
  );
}
