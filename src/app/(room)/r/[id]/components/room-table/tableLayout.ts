"use client";

import {
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  MAX_SCENE_SCALE,
  MIN_SCENE_HEIGHT,
  MIN_SCENE_WIDTH,
  OPPONENT_CARD_OFFSET_X,
  OPPONENT_HAND_OFFSET_Y,
  OPPONENT_OFFSET_Y,
  SLOT_COLS_BOTTOM,
  SLOT_COLS_TOP,
  SLOT_OFFSET_Y,
} from "@/common/cards";
import type { IRoom } from "@/types/common";
import { useEffect, useRef, useState } from "react";

export interface CardData {
  id: string;
  seatId: string;
  name: string;
  category: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  delay: number;
}

export interface Seat {
  id: string;
  x: number;
  y: number;
  isLocal: boolean;
}

export function getSlotPositions(seat: Seat) {
  const positions: { x: number; y: number }[] = [];
  const direction = seat.isLocal ? -1 : 1;
  const cardStrideX = CARD_WIDTH + CARD_GAP;
  const cardStrideY = CARD_HEIGHT + CARD_GAP;
  const bottomRowStartX =
    seat.x - ((SLOT_COLS_BOTTOM - 1) * cardStrideX) / 2;
  const bottomRowY = seat.y + direction * SLOT_OFFSET_Y;

  for (let index = 0; index < SLOT_COLS_BOTTOM; index++) {
    positions.push({
      x: bottomRowStartX + index * cardStrideX,
      y: bottomRowY,
    });
  }

  const topRowStartX =
    seat.x - ((SLOT_COLS_TOP - 1) * cardStrideX) / 2;
  const topRowY = bottomRowY + direction * cardStrideY;

  for (let index = 0; index < SLOT_COLS_TOP; index++) {
    positions.push({
      x: topRowStartX + index * cardStrideX,
      y: topRowY,
    });
  }

  return positions;
}

export function getHandY(seat: Seat) {
  return seat.y + (seat.isLocal ? SLOT_OFFSET_Y : OPPONENT_HAND_OFFSET_Y);
}

export function getOpponentCardX(seat: Seat, cardIndex: number) {
  return seat.x + OPPONENT_CARD_OFFSET_X + Math.max(cardIndex, 0) * 8;
}

export function getCenterCardPosition(width: number, height: number) {
  return { x: width / 2, y: height / 2 - CARD_HEIGHT };
}

export function getTableLayout(width: number, height: number) {
  return {
    center: { x: width / 2, y: height / 2 },
    radius: Math.min(width, height) * 0.35,
  };
}

export function getHandStartX(centerX: number, cardCount: number) {
  if (cardCount === 0) return centerX;

  const totalWidth =
    cardCount * CARD_WIDTH + (cardCount - 1) * CARD_GAP;
  return centerX + CARD_WIDTH / 2 - totalWidth / 2;
}

export function calculateSeats(
  players: IRoom["players"],
  localPlayerId: string,
  width: number,
  height: number,
): Seat[] {
  const list = Object.values(players);
  const others = list.filter((player) => player.id !== localPlayerId);
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * 0.38;
  const radiusY = height * 0.28;
  const arc = Math.PI * 1.1;

  const seats: Seat[] = [
    {
      ...players[localPlayerId],
      x: centerX,
      y: centerY + radiusY,
      isLocal: true,
    },
  ];

  others.forEach((player, index) => {
    const progress =
      others.length === 1 ? 0.5 : index / (others.length - 1);
    const angle = Math.PI / 2 + arc / 2 - progress * arc;

    seats.push({
      ...player,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY - Math.sin(angle) * radiusY + OPPONENT_OFFSET_Y,
      isLocal: false,
    });
  });

  return seats;
}

export function useStageSize() {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const sceneSizeRef = useRef({
    width: MIN_SCENE_WIDTH,
    height: MIN_SCENE_HEIGHT,
  });

  useEffect(() => {
    let resizeFrame = 0;
    const updateViewport = () => {
      const viewport = window.visualViewport;
      const nextSize = {
        width: Math.round(viewport?.width ?? window.innerWidth),
        height: Math.round(viewport?.height ?? window.innerHeight),
      };
      setViewportSize((currentSize) =>
        currentSize.width === nextSize.width &&
        currentSize.height === nextSize.height
          ? currentSize
          : nextSize,
      );
    };
    const onResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(updateViewport);
    };

    updateViewport();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.screen.orientation?.addEventListener("change", onResize);

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.screen.orientation?.removeEventListener("change", onResize);
    };
  }, []);

  const scale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(
          MAX_SCENE_SCALE,
          viewportSize.width / MIN_SCENE_WIDTH,
          viewportSize.height / MIN_SCENE_HEIGHT,
        )
      : 1;
  const sceneSize = {
    width: MIN_SCENE_WIDTH,
    height: MIN_SCENE_HEIGHT,
  };
  const offset = {
    x: (viewportSize.width - sceneSize.width * scale) / 2,
    y: (viewportSize.height - sceneSize.height * scale) / 2,
  };

  return { viewportSize, sceneSize, sceneSizeRef, scale, offset };
}
