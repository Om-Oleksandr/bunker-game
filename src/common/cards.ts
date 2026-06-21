import player_cards from "@/cards/bunker_data_no_special.json";

export const CARD_WIDTH = 90;
export const CARD_HEIGHT = 120;

export const CARD_GAP = 6;

export const CARDS_PER_PLAYER = Object.keys(player_cards).length;

export const DEAL_DURATION = 800;
export const DEAL_STAGGER = 300;

export const SPREAD_DURATION = 600;

export const FLIP_DURATION = 400;
export const FLIP_STAGGER = 80;

export const OPPONENT_OFFSET_Y = -110;

export const OPPONENT_HAND_OFFSET_Y = -70;
export const OPPONENT_CARD_OFFSET_X = -20;
export const OPPONENT_CARD_SCALE = 0.50;

export const SLOT_COLS_BOTTOM = 4;
export const SLOT_COLS_TOP = 3;
export const SLOT_OFFSET_Y = 105;

export const PLAY_TRAVEL_DURATION = 450;
export const PLAY_FLIP_DURATION = 300;
export const CENTER_CARD_SCALE = 1;

export const MIN_SCENE_WIDTH = 900;
export const MIN_SCENE_HEIGHT = 720;
export const MAX_SCENE_SCALE = 1.15;

export const CARD_PADDING = 10;
export const CARD_CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
export const CARD_LEFT = -CARD_WIDTH / 2 + CARD_PADDING;
export const CARD_TOP = -CARD_HEIGHT / 2 + CARD_PADDING;
export const CATEGORY_HEIGHT = 18;
export const NAME_TOP = CARD_TOP + CATEGORY_HEIGHT + 10;
export const NAME_HEIGHT =
  CARD_HEIGHT - CATEGORY_HEIGHT - CARD_PADDING * 3 - 10;

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

export function getDealPhaseDuration(playerCount: number): number {
  return DEAL_STAGGER * (CARDS_PER_PLAYER * playerCount - 1) + DEAL_DURATION;
}
