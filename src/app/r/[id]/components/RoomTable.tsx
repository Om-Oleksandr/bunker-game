"use client";

import { IRoom } from "@/types/common";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Ellipse } from "react-konva";
import Konva from "konva";
import {
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  CARDS_PER_PLAYER,
  DEAL_DURATION,
  DEAL_STAGGER,
  FLIP_DURATION,
  FLIP_STAGGER,
  OPPONENT_OFFSET_Y,
  SPREAD_DURATION,
} from "@/common/cards";
import { RealtimeChannel } from "ably";

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardData {
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

interface Seat {
  id: string;
  x: number;
  y: number;
  isLocal: boolean;
}

export interface RoomTableHandle {
  startDealAnimationFromOffset: (startedAt: number) => Promise<void>;
}

const CARD_PADDING = 10;
const CARD_CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
const CARD_LEFT = -CARD_WIDTH / 2 + CARD_PADDING;
const CARD_TOP = -CARD_HEIGHT / 2 + CARD_PADDING;
const CATEGORY_HEIGHT = 18;
const NAME_TOP = CARD_TOP + CATEGORY_HEIGHT + 10;
const NAME_HEIGHT = CARD_HEIGHT - CATEGORY_HEIGHT - CARD_PADDING * 3 - 10;

function getCardNameFontSize(text: string) {
  const length = Array.from(text).length;

  if (length > 56) return 8;
  if (length > 42) return 9;
  if (length > 30) return 10;
  if (length > 20) return 11;

  return 12;
}

function createCardRect(fill: string) {
  return new Konva.Rect({
    name: "cardRect",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    offsetX: CARD_WIDTH / 2,
    offsetY: CARD_HEIGHT / 2,
    cornerRadius: 6,
    fill,
    shadowBlur: 8,
  });
}

function createCardTextNodes(name: string, category: string, revealed: boolean) {
  const categoryText = new Konva.Text({
    name: "cardCategoryText",
    text: revealed ? category : "",
    x: CARD_LEFT,
    y: CARD_TOP,
    width: CARD_CONTENT_WIDTH,
    height: CATEGORY_HEIGHT,
    align: "center",
    verticalAlign: "middle",
    fontSize: 8,
    fontStyle: "bold",
    fill: "#111827",
    ellipsis: true,
  });

  const nameText = new Konva.Text({
    name: "cardNameText",
    text: revealed ? name : "",
    x: CARD_LEFT,
    y: NAME_TOP,
    width: CARD_CONTENT_WIDTH,
    height: NAME_HEIGHT,
    align: "center",
    verticalAlign: "middle",
    fontSize: getCardNameFontSize(name),
    fill: "#111827",
    lineHeight: 1.15,
    wrap: "word",
    ellipsis: true,
  });

  return { categoryText, nameText };
}

function revealCardText(node: Konva.Group) {
  const cardName = node.getAttr("cardName") as string;
  const cardCategory = node.getAttr("cardCategory") as string;
  const nameText = node.findOne(".cardNameText") as Konva.Text | undefined;
  const categoryText = node.findOne(".cardCategoryText") as
    | Konva.Text
    | undefined;

  nameText?.text(cardName);
  nameText?.fontSize(getCardNameFontSize(cardName));
  categoryText?.text(cardCategory);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useStageSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sizeRef = useRef(size);

  useEffect(() => {
    const onResize = () => {
      const nextSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      sizeRef.current = nextSize;
      setSize(nextSize);
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { size, sizeRef };
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function getLayout(width: number, height: number) {
  return {
    center: { x: width / 2, y: height / 2 },
    radius: Math.min(width, height) * 0.35,
  };
}

function calculateSeats(
  players: IRoom["players"],
  localPlayerId: string,
  width: number,
  height: number,
): Seat[] {
  const list = Object.values(players);
  const others = list.filter((p) => p.id !== localPlayerId);

  const centerX = width / 2;
  const centerY = height / 2;

  const radiusX = width * 0.38;
  const radiusY = height * 0.28;

  const ARC = Math.PI * 1.1;

  const seats: Seat[] = [];

  // local player bottom
  seats.push({
    ...players[localPlayerId],
    x: centerX,
    y: centerY + radiusY,
    isLocal: true,
  });

  // opponents arc
  others.forEach((player, i) => {
    const t = others.length === 1 ? 0.5 : i / (others.length - 1);
    const angle = Math.PI / 2 + ARC / 2 - t * ARC;

    seats.push({
      ...player,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY - Math.sin(angle) * radiusY + OPPONENT_OFFSET_Y,
      isLocal: false,
    });
  });

  return seats;
}

// ─── Animation duration ───────────────────────────────────────────────────────

function getTotalAnimationDuration(playerCount: number): number {
  const dealDuration =
    DEAL_STAGGER * (CARDS_PER_PLAYER * playerCount - 1) + DEAL_DURATION;
  const spreadDuration = SPREAD_DURATION;
  const flipDuration = FLIP_STAGGER * (CARDS_PER_PLAYER - 1) + FLIP_DURATION;

  return dealDuration + spreadDuration + flipDuration;
}

function getDealPhaseDuration(playerCount: number): number {
  return DEAL_STAGGER * (CARDS_PER_PLAYER * playerCount - 1) + DEAL_DURATION;
}

// ─── Animation helpers ────────────────────────────────────────────────────────

function waitForAnimation(
  layer: Konva.Layer,
  onFrame: (elapsed: number) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();

    const anim = new Konva.Animation(() => {
      const elapsed = performance.now() - start;
      const active = onFrame(elapsed);

      if (!active) {
        anim.stop();
        resolve();
      }
    }, layer);

    anim.start();
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const RoomTable = forwardRef<
  RoomTableHandle,
  {
    room: IRoom;
    roomId: string;
    userId: string;
    channel: RealtimeChannel;
  }
>(
  (
    {
      room,
      userId,
      roomId,
      channel,
    },
    ref,
  ) => {
    const { size, sizeRef } = useStageSize();

    const layerRef = useRef<Konva.Layer>(null);
    const cardNodesRef = useRef<Map<string, Konva.Group>>(new Map());

    const getSeats = useCallback((): Seat[] => {
      const { width, height } = sizeRef.current;
      return calculateSeats(room.players, userId, width, height);
    }, [room.players, sizeRef, userId]);

    // ─── RENDER IMMEDIATELY (on reload after animation done) ──────────────────

    const hasCards = Object.values(room.players).some(
      (player) => player.cards.length > 0,
    );

    const renderCardsImmediately = useCallback(() => {
      const seats = getSeats();

      cardNodesRef.current.forEach((node) => node.destroy());
      cardNodesRef.current.clear();

      for (const seat of seats) {
        const cards = room.players[seat.id]?.cards ?? [];
        const totalWidth = cards.length * (CARD_WIDTH + CARD_GAP) - CARD_GAP;
        const startX = seat.x - totalWidth / 2;
        const y = seat.isLocal ? seat.y + 120 : seat.y;

        cards.forEach((card, index) => {
          const group = new Konva.Group({
            x: seat.isLocal
              ? startX + index * (CARD_WIDTH + CARD_GAP)
              : seat.x + index * 8,
            y,
          });

          group.setAttr("cardName", card.name);
          group.setAttr("cardCategory", card.category);
          group.setAttr("seatId", seat.id);

          const { categoryText, nameText } = createCardTextNodes(
            card.name,
            card.category,
            seat.isLocal,
          );

          group.add(createCardRect(seat.isLocal ? "#fee2e2" : "#1e40af"));
          group.add(categoryText);
          group.add(nameText);

          const cardId = `${seat.id}-${index}`;
          layerRef.current!.add(group);
          cardNodesRef.current.set(cardId, group);
        });
      }

      layerRef.current!.draw();
    }, [getSeats, room.players]);

    useEffect(() => {
      if (!layerRef.current) return;
      if (hasCards && room.phase !== "dealing") {
        renderCardsImmediately();
      }
    }, [hasCards, renderCardsImmediately, room.phase, size]);

    // ─── MOUNT CARDS ──────────────────────────────────────────────────────────

    function mountCards(seats: Seat[]): CardData[] {
      const layer = layerRef.current!;
      const { width, height } = sizeRef.current;

      cardNodesRef.current.forEach((n) => n.destroy());
      cardNodesRef.current.clear();

      const deckX = width / 2;
      const deckY = height / 2;

      const cards: CardData[] = [];
      let index = 0;

      for (let round = 0; round < CARDS_PER_PLAYER; round++) {
        for (const seat of seats) {
          const storeCard = room.players[seat.id]?.cards?.[round] ?? {
            name: "UNKNOWN",
            category: "UNKNOWN",
          };

          const card: CardData = {
            id: `${seat.id}-${round}`,
            seatId: seat.id,
            name: storeCard.name,
            category: storeCard.category,
            startX: deckX,
            startY: deckY,
            targetX: seat.x + round * 8,
            targetY: seat.y,
            delay: index * DEAL_STAGGER,
          };

          cards.push(card);

          const group = new Konva.Group({ x: deckX, y: deckY });

          group.setAttr("cardName", storeCard.name);
          group.setAttr("cardCategory", storeCard.category);
          group.setAttr("seatId", seat.id);

          const { categoryText, nameText } = createCardTextNodes(
            storeCard.name,
            storeCard.category,
            false,
          );

          group.add(createCardRect("#1e40af"));
          group.add(categoryText);
          group.add(nameText);

          layer.add(group);
          cardNodesRef.current.set(card.id, group);

          index++;
        }
      }

      return cards;
    }

    // ─── JUMP HELPERS (skip phases instantly) ─────────────────────────────────

    function jumpToDealEnd(cards: CardData[]) {
      for (const card of cards) {
        const node = cardNodesRef.current.get(card.id);
        if (!node) continue;
        node.x(card.targetX);
        node.y(card.targetY);
      }
    }

    function jumpToSpreadEnd(cards: CardData[], seat: Seat) {
      const totalWidth = cards.length * (CARD_WIDTH + CARD_GAP) - CARD_GAP;
      const startX = seat.x - totalWidth / 2;
      const y = seat.y + 120;

      for (const [i, card] of cards.entries()) {
        const node = cardNodesRef.current.get(card.id);
        if (!node) continue;
        node.x(startX + i * (CARD_WIDTH + CARD_GAP));
        node.y(y);
      }
    }

    // ─── DEAL ANIMATION ───────────────────────────────────────────────────────

    async function animateDeal(
      cards: CardData[],
      layer: Konva.Layer,
      initialOffset = 0,
    ) {
      await waitForAnimation(layer, (elapsed) => {
        let active = false;

        const adjustedTime = elapsed + initialOffset;

        for (const card of cards) {
          const t = Math.min(
            Math.max((adjustedTime - card.delay) / DEAL_DURATION, 0),
            1,
          );

          const ease = 1 - Math.pow(1 - t, 3);

          const node = cardNodesRef.current.get(card.id);
          if (!node) continue;

          node.x(card.startX + (card.targetX - card.startX) * ease);
          node.y(card.startY + (card.targetY - card.startY) * ease);

          if (t < 1) active = true;
        }

        return active;
      });
    }

    // ─── SPREAD ───────────────────────────────────────────────────────────────

    async function animateSpread(
      cards: CardData[],
      seat: Seat,
      layer: Konva.Layer,
      startOffset = 0,
    ) {
      const snapshots = new Map<string, { x: number; y: number }>();

      for (const c of cards) {
        const node = cardNodesRef.current.get(c.id);
        if (node) snapshots.set(c.id, { x: node.x(), y: node.y() });
      }

      const totalWidth = cards.length * (CARD_WIDTH + CARD_GAP) - CARD_GAP;
      const startX = seat.x - totalWidth / 2;
      const y = seat.y + 120;

      const targets = new Map<string, { x: number; y: number }>();
      cards.forEach((c, i) => {
        targets.set(c.id, { x: startX + i * (CARD_WIDTH + CARD_GAP), y });
      });

      await waitForAnimation(layer, (elapsed) => {
        const adjustedElapsed = elapsed + startOffset;
        let active = false;

        const t = Math.min(adjustedElapsed / SPREAD_DURATION, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        for (const c of cards) {
          const node = cardNodesRef.current.get(c.id);
          const from = snapshots.get(c.id);
          const to = targets.get(c.id);

          if (!node || !from || !to) continue;

          node.x(from.x + (to.x - from.x) * ease);
          node.y(from.y + (to.y - from.y) * ease);

          if (t < 1) active = true;
        }

        return active;
      });
    }

    // ─── FLIP ─────────────────────────────────────────────────────────────────

    async function animateFlip(
      cards: CardData[],
      layer: Konva.Layer,
      startOffset = 0,
    ) {
      const localCards = cards.filter((c) => c.seatId === userId);

      const entries = localCards
        .map((c) => [c.id, cardNodesRef.current.get(c.id)] as const)
        .filter(([, n]) => n);

      await waitForAnimation(layer, (elapsed) => {
        const adjustedElapsed = elapsed + startOffset;
        let active = false;

        entries.forEach(([, node], i) => {
          const t = Math.min(
            Math.max((adjustedElapsed - i * FLIP_STAGGER) / FLIP_DURATION, 0),
            1,
          );

          const rect = node!.findOne(".cardRect") as Konva.Rect;

          if (t < 0.5) {
            node!.scaleX(1 - t * 2);
          } else {
            rect.fill("#fee2e2");
            revealCardText(node!);
            node!.scaleX((t - 0.5) * 2);
          }

          if (t < 1) active = true;
        });

        return active;
      });
    }

    // ─── ORCHESTRATOR (fresh start) ───────────────────────────────────────────

    // ─── ORCHESTRATOR (resume from timestamp) ─────────────────────────────────

    const startDealAnimationFromOffset = async (startedAt: number) => {
      const layer = layerRef.current;
      if (!layer) return;

      const elapsed = Date.now() - startedAt;
      const playerCount = Object.keys(room.players).length;
      const totalDuration = getTotalAnimationDuration(playerCount);

      // animation already finished — just render final state
      if (elapsed >= totalDuration) {
        renderCardsImmediately();
        return;
      }

      const seats = getSeats();
      const cards = mountCards(seats);
      const localCards = cards.filter((c) => c.seatId === userId);

      const dealPhaseEnd = getDealPhaseDuration(playerCount);
      const spreadPhaseEnd = dealPhaseEnd + SPREAD_DURATION;

      if (elapsed < dealPhaseEnd) {
        // still in deal phase — fast-forward deal, then run spread + flip normally
        await animateDeal(cards, layer, elapsed);
        await animateSpread(localCards, seats[0], layer);
        await animateFlip(localCards, layer);
      } else if (elapsed < spreadPhaseEnd) {
        // deal done — skip it, fast-forward spread, then run flip normally
        jumpToDealEnd(cards);
        await animateSpread(
          localCards,
          seats[0],
          layer,
          elapsed - dealPhaseEnd,
        );
        await animateFlip(localCards, layer);
      } else {
        // deal + spread done — skip both, fast-forward flip
        jumpToDealEnd(cards);
        jumpToSpreadEnd(localCards, seats[0]);
        await animateFlip(localCards, layer, elapsed - spreadPhaseEnd);
      }
    };

    // ─── ABLY ──────────────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      startDealAnimationFromOffset,
    }));

    // ─── TRIGGER ───────────────────────────────────────────────────────────────

    async function deal() {
      const res = await fetch(`/api/room/${roomId}/deal-cards`, {
        method: "POST",
        body: JSON.stringify({ roomId, room }),
      });

      const json: { data?: { dealStartedAt: number }; error?: string } =
        await res.json();

      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Failed to deal cards");
      }

      await channel.publish("deal-start", {
        startedAt: json.data.dealStartedAt,
      });
    }

    // ─── RENDER ────────────────────────────────────────────────────────────────

    const { width, height } = size;
    const seats = calculateSeats(room.players, userId, width, height);
    const layout = getLayout(width, height);

    return (
      <>
        <button onClick={deal}>deal cards</button>

        <Stage width={width} height={height}>
          <Layer ref={layerRef}>
            <Rect width={width} height={height} fill="#145a32" />

            <Ellipse
              x={layout.center.x}
              y={layout.center.y}
              radiusX={layout.radius * 1.6}
              radiusY={layout.radius * 1.1}
              fill="#de0efa"
            />

            {seats.map((p) => (
              <Group key={p.id} x={p.x} y={p.y}>
                <Circle radius={32} fill="#222" />
                <Text text={p.id} fill="white" x={-70} y={40} />
              </Group>
            ))}
          </Layer>
        </Stage>
      </>
    );
  },
);

RoomTable.displayName = "RoomTable";

export default RoomTable;
