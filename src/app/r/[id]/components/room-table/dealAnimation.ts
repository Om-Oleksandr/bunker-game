import {
  CARD_GAP,
  CARD_WIDTH,
  DEAL_DURATION,
  FLIP_DURATION,
  FLIP_STAGGER,
  SPREAD_DURATION,
} from "@/common/cards";
import Konva from "konva";
import { easeOutCubic, waitForAnimation } from "./animation";
import { revealCardText } from "./cardNodes";
import {
  getHandStartX,
  getHandY,
  type CardData,
  type Seat,
} from "./tableLayout";

type CardNodeMap = Map<string, Konva.Group>;

export function jumpToDealEnd(cards: CardData[], nodes: CardNodeMap) {
  for (const card of cards) {
    const node = nodes.get(card.id);
    if (!node) continue;
    node.position({ x: card.targetX, y: card.targetY });
    const cardScale =
      (node.getAttr("cardScale") as number | undefined) ?? 1;
    node.scale({ x: cardScale, y: cardScale });
  }
}

export function jumpToSpreadEnd(
  cards: CardData[],
  seat: Seat,
  nodes: CardNodeMap,
) {
  const startX = getHandStartX(seat.x, cards.length);
  const y = getHandY(seat);

  cards.forEach((card, index) => {
    nodes.get(card.id)?.position({
      x: startX + index * (CARD_WIDTH + CARD_GAP),
      y,
    });
  });
}

export async function animateDeal(
  cards: CardData[],
  layer: Konva.Layer,
  nodes: CardNodeMap,
  initialOffset = 0,
) {
  await waitForAnimation(layer, (elapsed) => {
    let active = false;
    const adjustedTime = elapsed + initialOffset;

    for (const card of cards) {
      const progress = Math.min(
        Math.max((adjustedTime - card.delay) / DEAL_DURATION, 0),
        1,
      );
      const easedTime = easeOutCubic(progress);
      const node = nodes.get(card.id);
      if (!node) continue;

      const cardScale =
        (node.getAttr("cardScale") as number | undefined) ?? 1;
      const scale = 1 + (cardScale - 1) * easedTime;
      node.position({
        x: card.startX + (card.targetX - card.startX) * easedTime,
        y: card.startY + (card.targetY - card.startY) * easedTime,
      });
      node.scale({ x: scale, y: scale });

      if (progress < 1) active = true;
    }

    return active;
  });
}

export async function animateSpread(
  cards: CardData[],
  seat: Seat,
  layer: Konva.Layer,
  nodes: CardNodeMap,
  startOffset = 0,
) {
  const snapshots = new Map<string, { x: number; y: number }>();
  cards.forEach((card) => {
    const node = nodes.get(card.id);
    if (node) snapshots.set(card.id, node.position());
  });

  const startX = getHandStartX(seat.x, cards.length);
  const y = getHandY(seat) + 15;
  const targets = new Map<string, { x: number; y: number }>();
  cards.forEach((card, index) => {
    targets.set(card.id, {
      x: startX + index * (CARD_WIDTH + CARD_GAP),
      y,
    });
  });

  await waitForAnimation(layer, (elapsed) => {
    const progress = Math.min(
      (elapsed + startOffset) / SPREAD_DURATION,
      1,
    );
    const easedTime = easeOutCubic(progress);

    for (const card of cards) {
      const node = nodes.get(card.id);
      const from = snapshots.get(card.id);
      const to = targets.get(card.id);
      if (!node || !from || !to) continue;

      node.position({
        x: from.x + (to.x - from.x) * easedTime,
        y: from.y + (to.y - from.y) * easedTime,
      });
    }

    return progress < 1;
  });
}

export async function animateFlip(
  cards: CardData[],
  layer: Konva.Layer,
  nodes: CardNodeMap,
  userId: string,
  startOffset = 0,
) {
  const entries = cards
    .filter((card) => card.seatId === userId)
    .map((card) => nodes.get(card.id))
    .filter((node): node is Konva.Group => Boolean(node));

  await waitForAnimation(layer, (elapsed) => {
    const adjustedElapsed = elapsed + startOffset;
    let active = false;

    entries.forEach((node, index) => {
      const progress = Math.min(
        Math.max(
          (adjustedElapsed - index * FLIP_STAGGER) / FLIP_DURATION,
          0,
        ),
        1,
      );
      const rect = node.findOne(".cardRect") as Konva.Rect;

      if (progress < 0.5) {
        node.scaleX(1 - progress * 2);
      } else {
        rect.fill("#fee2e2");
        revealCardText(node);
        node.scaleX((progress - 0.5) * 2);
      }

      if (progress < 1) active = true;
    });

    return active;
  });
}
