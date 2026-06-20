"use client";

import { IActiveCardPlay, IRoom } from "@/types/common";
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
  CENTER_CARD_SCALE,
  DEAL_STAGGER,
  OPPONENT_CARD_SCALE,
  PLAY_FLIP_DURATION,
  PLAY_TRAVEL_DURATION,
  SPREAD_DURATION,
  getDealPhaseDuration,
  getTotalAnimationDuration,
} from "@/common/cards";
import { RealtimeChannel } from "ably";
import {
  createCardRect,
  createCardTextNodes,
  getCardPayload,
  revealCardText,
} from "./room-table/cardNodes";
import { easeOutCubic, waitForAnimation } from "./room-table/animation";
import {
  animateDeal,
  animateFlip,
  animateSpread,
  jumpToDealEnd,
  jumpToSpreadEnd,
} from "./room-table/dealAnimation";
import {
  calculateSeats,
  getCenterCardPosition,
  getHandStartX,
  getHandY,
  getOpponentCardX,
  getSlotPositions,
  getTableLayout,
  useStageSize,
  type CardData,
  type Seat,
} from "./room-table/tableLayout";

// ─── Constants ────────────────────────────────────────────────────────────────
// ─── Constants (ADD THESE) ────────────────────────────────────────────────────

// Slot grid layout relative to each player's seat position.
// Bottom row: 4 cards, top row: 3 cards, filling left-to-right bottom-first.

// ─── New helper: compute the 7 slot positions for a given seat ────────────────

/**
 * Returns world positions for all 7 card slots arranged above a seat.
 *
 * Slots are numbered 0–6.
 * Indices 0–3 → bottom row (left to right)
 * Indices 4–6 → top    row (left to right)
 *
 * For the local player (bottom of screen) the grid opens upward.
 * For opponents (top arc) the grid opens downward — negate SLOT_OFFSET_Y.
 */
/**
 * Returns the next free slot index (0–6) for a seat, or -1 when full.
 * Slots fill left-to-right, bottom row first (indices 0, 1, 2, 3, 4, 5, 6).
 */
// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoomTableHandle {
  startDealAnimationFromOffset: (startedAt: number) => Promise<void>;
  animateCardPlay: (payload: {
    // ← ADD THIS
    seatId: string;
    cardId: string;
    name: string;
    category: string;
    slotIndex: number;
    startedAt: number;
    returnStartedAt: number;
    returnedAt: number;
  }) => Promise<void>;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

// ─── Layout ───────────────────────────────────────────────────────────────────

// ─── Animation duration ───────────────────────────────────────────────────────

// ─── Animation helpers ────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

const RoomTable = forwardRef<
  RoomTableHandle,
  {
    room: IRoom;
    roomId: string;
    userId: string;
    channel: RealtimeChannel;
  }
>(({ room, userId, roomId, channel }, ref) => {
  const { viewportSize, sceneSize, sceneSizeRef, scale, offset } =
    useStageSize();
  const [now, setNow] = useState(() => Date.now());

  const layerRef = useRef<Konva.Layer>(null);
  const cardNodesRef = useRef<Map<string, Konva.Group>>(new Map());

  const isAnimatingRef = useRef(false);
  const animatedPlayStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const timelineEnd = room.turnAvailableAt;
    if (!timelineEnd || Date.now() >= timelineEnd) return;

    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= timelineEnd) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [room.turnAvailableAt]);
  // ─── Easing helper (reuse for card-play too) ──────────────────────────────

  const { width, height } = sceneSize;
  const seats = calculateSeats(room.players, userId, width, height);
  const layout = getTableLayout(width, height);
  const currentTurn = room.currentTurn ?? Object.keys(room.players)[0] ?? "";
  const explanationEndsAt = room.activeCardPlay?.returnStartedAt ?? 0;
  const statusText =
    room.activeCardPlay && now < explanationEndsAt
      ? `Explain your card: ${Math.ceil((explanationEndsAt - now) / 1000)}s`
      : room.turnAvailableAt && now < room.turnAvailableAt
        ? `Next turn in ${Math.ceil((room.turnAvailableAt - now) / 1000)}s`
        : currentTurn === userId
          ? "Your turn"
          : "Waiting for another player";

  const getSeats = useCallback((): Seat[] => {
    const { width, height } = sceneSizeRef.current;
    return calculateSeats(room.players, userId, width, height);
  }, [room.players, sceneSizeRef, userId]);

  // ----play card
  const animateCardPlay = useCallback(
    async (payload: IActiveCardPlay) => {
      isAnimatingRef.current = true;
      try {
        const layer = layerRef.current;
        if (!layer) return;

        const { seatId, cardId, slotIndex, returnStartedAt, returnedAt } =
          payload;

        // Find the Konva node for this card (it was placed during deal animation)
        const node = cardNodesRef.current.get(cardId);
        if (!node) return;
        if (animatedPlayStartedAtRef.current === payload.startedAt) return;
        animatedPlayStartedAtRef.current = payload.startedAt;

        // Find the seat so we can access its slot positions
        const seats = getSeats();
        const seat = seats.find((s) => s.id === seatId);
        if (!seat) return;

        // Determine target slot ─────────────────────────────────────────────
        if (slotIndex === -1) return; // all 7 slots full, ignore

        const slotPositions = getSlotPositions(seat);
        const cardIndex = room.players[seatId].cards.findIndex(
          ({ id }) => id === cardId,
        );
        const targetSlot = seat.isLocal
          ? slotPositions[slotIndex]
          : {
              x: getOpponentCardX(seat, cardIndex),
              y: getHandY(seat),
            };
        const { width, height } = sceneSizeRef.current;
        const centerCard = getCenterCardPosition(width, height);

        // Disable click while animating so the card can't be played twice
        node.off("click tap mouseenter mouseleave");
        node.setAttr("isPlayed", true);

        if (seat.isLocal) {
          // ── LOCAL PLAYER: direct travel to slot ────────────────────────────
          const fromX = node.x();
          const fromY = node.y();
          const remainingCards = room.players[seatId].cards.filter(
            (card) => !card.isPlayed && card.id !== cardId,
          );
          const remainingStartX = getHandStartX(seat.x, remainingCards.length);
          const handY = getHandY(seat);
          const handTransitions = remainingCards.flatMap((card, index) => {
            const cardNode = cardNodesRef.current.get(card.id);
            if (!cardNode) return [];

            cardNode.off("click tap mouseenter mouseleave");
            return [
              {
                node: cardNode,
                fromX: cardNode.x(),
                fromY: cardNode.y(),
                toX: remainingStartX + index * (CARD_WIDTH + CARD_GAP),
                toY: handY,
              },
            ];
          });

          await waitForAnimation(layer, (elapsed) => {
            const t = Math.min(elapsed / PLAY_TRAVEL_DURATION, 1);
            const easedTime = easeOutCubic(t);
            node.x(fromX + (targetSlot.x - fromX) * easedTime);
            node.y(fromY + (targetSlot.y - fromY) * easedTime);

            handTransitions.forEach((transition) => {
              transition.node.x(
                transition.fromX +
                  (transition.toX - transition.fromX) * easedTime,
              );
              transition.node.y(
                transition.fromY +
                  (transition.toY - transition.fromY) * easedTime,
              );
            });
            return t < 1;
          });

          // Card is already face-up (red) — nothing more to do visually.
          // Remove hover/click so it's no longer interactive.
        } else {
          // ── OPPONENT CARD: centre → flip → return to slot ─────────────────
          const fromX = node.x();
          const fromY = node.y();
          const revealCompletedAt =
            payload.startedAt + PLAY_TRAVEL_DURATION + PLAY_FLIP_DURATION;
          const isAlreadyAtCenter =
            Math.abs(node.x() - centerCard.x) < 1 &&
            Math.abs(node.y() - centerCard.y) < 1;
          const resumeAtCenter =
            isAlreadyAtCenter || Date.now() >= revealCompletedAt;
          const cardScale =
            (node.getAttr("cardScale") as number | undefined) ??
            OPPONENT_CARD_SCALE;

          if (resumeAtCenter) {
            const rect = node.findOne(".cardRect") as Konva.Rect | undefined;
            node.position(centerCard);
            node.scale({ x: CENTER_CARD_SCALE, y: CENTER_CARD_SCALE });
            if (rect) rect.fill("#fee2e2");
            revealCardText(node);
          } else {
            // Step 1: travel to board centre
            await waitForAnimation(layer, (elapsed) => {
              const t = Math.min(elapsed / PLAY_TRAVEL_DURATION, 1);
              const easedTime = easeOutCubic(t);
              const scale =
                cardScale + (CENTER_CARD_SCALE - cardScale) * easedTime;
              node.x(fromX + (centerCard.x - fromX) * easedTime);
              node.y(fromY + (centerCard.y - fromY) * easedTime);
              node.scale({ x: scale, y: scale });

              return t < 1;
            });

            // Step 2: flip to reveal
            const rect = node.findOne(".cardRect") as Konva.Rect | undefined;

            await waitForAnimation(layer, (elapsed) => {
              const t = Math.min(elapsed / PLAY_FLIP_DURATION, 1);

              if (t < 0.5) {
                node.scaleX(CENTER_CARD_SCALE * (1 - t * 2));
              } else {
                if (rect) rect.fill("#fee2e2");
                revealCardText(node);
                node.scaleX(CENTER_CARD_SCALE * (t - 0.5) * 2);
              }

              return t < 1;
            });

            node.scale({ x: CENTER_CARD_SCALE, y: CENTER_CARD_SCALE });
          }

          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              Math.max(returnStartedAt - Date.now(), 0),
            ),
          );

          // Step 3: return to the card's original hand position
          const returnDuration = Math.max(returnedAt - Date.now(), 1);
          await waitForAnimation(layer, (elapsed) => {
            const t = Math.min(elapsed / returnDuration, 1);
            const easedTime = easeOutCubic(t);
            const scale =
              CENTER_CARD_SCALE + (cardScale - CENTER_CARD_SCALE) * easedTime;
            node.x(centerCard.x + (targetSlot.x - centerCard.x) * easedTime);
            node.y(centerCard.y + (targetSlot.y - centerCard.y) * easedTime);
            node.scale({ x: scale, y: scale });
            return t < 1;
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        isAnimatingRef.current = false;
        // renderCardsImmediately();
      }
    },
    [getSeats, room.players, sceneSizeRef],
  );

  useEffect(() => {
    const play = room.activeCardPlay;
    if (!play || Date.now() >= play.returnedAt) return;
    if (animatedPlayStartedAtRef.current === play.startedAt) return;

    requestAnimationFrame(() => {
      void animateCardPlay(play);
    });
  }, [animateCardPlay, room.activeCardPlay]);

  const enableCardClick = useCallback(
    (node: Konva.Group, cardId: string) => {
      node.off("click tap mouseenter mouseleave");
      node.on("click tap", async () => {
        if (node.getAttr("isSubmitting")) return;
        node.setAttr("isSubmitting", true);

        try {
          const payload = { ...getCardPayload(node), cardId };
          const response = await fetch(`/api/room/${roomId}/play-card`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json: {
            data?: { play: IActiveCardPlay };
            error?: string;
          } = await response.json();

          if (!response.ok || !json.data) {
            throw new Error(json.error ?? "Failed to play card");
          }

          await channel.publish("card-played", json.data.play);
        } catch (err) {
          console.error("Failed to play card:", err);
          node.setAttr("isSubmitting", false);
        }
      });
      node.on("mouseenter", () => {
        const stage = node.getStage();
        if (stage) stage.container().style.cursor = "pointer";
      });
      node.on("mouseleave", () => {
        const stage = node.getStage();
        if (stage) stage.container().style.cursor = "default";
      });
    },
    [channel, roomId],
  );

  const enableLocalCardClicks = useCallback(() => {
    cardNodesRef.current.forEach((node, cardId) => {
      if (node.getAttr("seatId") !== userId) return;

      node.off("click tap mouseenter mouseleave");
      const canPlay =
        currentTurn === userId &&
        (!room.turnAvailableAt || now >= room.turnAvailableAt);

      if (canPlay) {
        enableCardClick(node, cardId);
      }
    });
  }, [currentTurn, enableCardClick, now, room.turnAvailableAt, userId]);

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

      const handCards = cards.filter((c) => !c.isPlayed);
      const playedCards = cards
        .filter((c) => c.isPlayed)
        .sort((firstCard, secondCard) => {
          const firstOrder = firstCard.playedOrder ?? cards.indexOf(firstCard);
          const secondOrder =
            secondCard.playedOrder ?? cards.indexOf(secondCard);
          return firstOrder - secondOrder;
        });

      // ── Hand cards ──────────────────────────────────────────────────────────
      const startX = getHandStartX(seat.x, handCards.length);
      const y = getHandY(seat) + 15;

      (seat.isLocal ? handCards : []).forEach((card, index) => {
        const group = new Konva.Group({
          x: startX + index * (CARD_WIDTH + CARD_GAP),
          y,
        });

        group.setAttr("cardName", card.name);
        group.setAttr("cardCategory", card.category);
        group.setAttr("seatId", seat.id);
        group.setAttr("isPlayed", false);

        const { categoryText, nameText } = createCardTextNodes(
          card.name,
          card.category,
          seat.isLocal, // ← false for opponents = face-down, true for local = face-up
        );

        group.add(createCardRect(seat.isLocal ? "#fee2e2" : "#1e40af")); // red=local, blue=opponent
        group.add(categoryText);
        group.add(nameText);

        const cardId = card.id;
        layerRef.current!.add(group);
        cardNodesRef.current.set(cardId, group);
      });

      // ── Played cards (in slots) ─────────────────────────────────────────────

      // ── Played cards (slots for local player only) ──────────────────────────
      if (seat.isLocal) {
        const slotPositions = getSlotPositions(seat);

        playedCards.forEach((card, index) => {
          const slot = slotPositions[index];
          if (!slot) return;

          const group = new Konva.Group({ x: slot.x, y: slot.y });

          group.setAttr("cardName", card.name);
          group.setAttr("cardCategory", card.category);
          group.setAttr("seatId", seat.id);
          group.setAttr("isPlayed", true);

          const { categoryText, nameText } = createCardTextNodes(
            card.name,
            card.category,
            true,
          );

          group.add(createCardRect("#fee2e2"));
          group.add(categoryText);
          group.add(nameText);

          const cardId = card.id;
          layerRef.current!.add(group);
          cardNodesRef.current.set(cardId, group);
        });
      } else {
        cards.forEach((card, originalIndex) => {
          const activeInCenter =
            card.isPlayed &&
            room.activeCardPlay?.cardId === card.id &&
            now < room.activeCardPlay.returnStartedAt;
          const centerCard = getCenterCardPosition(
            sceneSizeRef.current.width,
            sceneSizeRef.current.height,
          );

          const group = new Konva.Group({
            x: activeInCenter
              ? centerCard.x
              : getOpponentCardX(seat, originalIndex),
            y: activeInCenter ? centerCard.y : getHandY(seat),
            scaleX: activeInCenter ? CENTER_CARD_SCALE : OPPONENT_CARD_SCALE,
            scaleY: activeInCenter ? CENTER_CARD_SCALE : OPPONENT_CARD_SCALE,
          });

          group.setAttr("cardName", card.name);
          group.setAttr("cardCategory", card.category);
          group.setAttr("seatId", seat.id);
          group.setAttr("isPlayed", card.isPlayed);
          group.setAttr("cardScale", OPPONENT_CARD_SCALE);

          const { categoryText, nameText } = createCardTextNodes(
            card.name,
            card.category,
            card.isPlayed,
          );

          group.add(createCardRect(card.isPlayed ? "#fee2e2" : "#1e40af"));
          group.add(categoryText);
          group.add(nameText);

          const cardId = card.id;
          layerRef.current!.add(group);
          cardNodesRef.current.set(cardId, group);
        });
      }
    }

    enableLocalCardClicks();
    layerRef.current!.draw();
  }, [
    enableLocalCardClicks,
    getSeats,
    now,
    room.activeCardPlay,
    room.players,
    sceneSizeRef,
  ]);

  useEffect(() => {
    if (!layerRef.current) return;
    if (isAnimatingRef.current) return;
    if (hasCards && room.phase !== "dealing") {
      renderCardsImmediately();
    }
  }, [
    hasCards,
    renderCardsImmediately,
    room.phase,
    sceneSize.height,
    sceneSize.width,
  ]);

  // ─── MOUNT CARDS ──────────────────────────────────────────────────────────

  function mountCards(seats: Seat[]): CardData[] {
    const layer = layerRef.current!;
    const { width, height } = sceneSizeRef.current;

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
          targetX: seat.isLocal
            ? seat.x + round * 8
            : getOpponentCardX(seat, round),
          targetY: getHandY(seat),
          delay: index * DEAL_STAGGER,
        };

        cards.push(card);

        const cardScale = seat.isLocal ? 1 : OPPONENT_CARD_SCALE;
        const group = new Konva.Group({
          x: deckX,
          y: deckY,
          scaleX: 1,
          scaleY: 1,
        });

        group.setAttr("cardName", storeCard.name);
        group.setAttr("cardCategory", storeCard.category);
        group.setAttr("seatId", seat.id);
        group.setAttr("isPlayed", false);
        group.setAttr("cardScale", cardScale);

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

    for (let index = cards.length - 1; index >= 0; index--) {
      cardNodesRef.current.get(cards[index].id)?.moveToTop();
    }

    return cards;
  }

  // ─── JUMP HELPERS (skip phases instantly) ─────────────────────────────────

  // ─── DEAL ANIMATION ───────────────────────────────────────────────────────

  // ─── SPREAD ───────────────────────────────────────────────────────────────

  // ─── FLIP ─────────────────────────────────────────────────────────────────

  // ─── ORCHESTRATOR (fresh start) ───────────────────────────────────────────

  // ─── ORCHESTRATOR (resume from timestamp) ─────────────────────────────────

  const startDealAnimationFromOffset = async (startedAt: number) => {
    const layer = layerRef.current;
    if (!layer) return;
    isAnimatingRef.current = true;

    const elapsed = Date.now() - startedAt;
    const playerCount = Object.keys(room.players).length;
    const totalDuration = getTotalAnimationDuration(playerCount);

    // animation already finished — just render final state
    if (elapsed >= totalDuration) {
      renderCardsImmediately();
      isAnimatingRef.current = false;
      return;
    }

    const seats = getSeats();
    const cards = mountCards(seats);
    const localCards = cards.filter((c) => c.seatId === userId);

    const dealPhaseEnd = getDealPhaseDuration(playerCount);
    const spreadPhaseEnd = dealPhaseEnd + SPREAD_DURATION;

    if (elapsed < dealPhaseEnd) {
      // still in deal phase — fast-forward deal, then run spread + flip normally
      await animateDeal(cards, layer, cardNodesRef.current, elapsed);
      await animateSpread(localCards, seats[0], layer, cardNodesRef.current);
      await animateFlip(localCards, layer, cardNodesRef.current, userId);
    } else if (elapsed < spreadPhaseEnd) {
      // deal done — skip it, fast-forward spread, then run flip normally
      jumpToDealEnd(cards, cardNodesRef.current);
      await animateSpread(
        localCards,
        seats[0],
        layer,
        cardNodesRef.current,
        elapsed - dealPhaseEnd,
      );
      await animateFlip(localCards, layer, cardNodesRef.current, userId);
    } else {
      // deal + spread done — skip both, fast-forward flip
      jumpToDealEnd(cards, cardNodesRef.current);
      jumpToSpreadEnd(localCards, seats[0], cardNodesRef.current);
      await animateFlip(
        localCards,
        layer,
        cardNodesRef.current,
        userId,
        elapsed - spreadPhaseEnd,
      );
    }

    enableLocalCardClicks();
    isAnimatingRef.current = false;
  };

  // ─── ABLY ──────────────────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    startDealAnimationFromOffset,
    animateCardPlay,
  }));

  // ─── TRIGGER ───────────────────────────────────────────────────────────────

  async function deal() {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    cardNodesRef.current.forEach((node) => node.destroy());
    cardNodesRef.current.clear();
    layerRef.current?.draw();

    try {
      const res = await fetch(`/api/room/${roomId}/deal-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, room }),
      });

      const json: { data?: { dealStartedAt: number }; error?: string } =
        await res.json();

      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Failed to deal cards");
      }

      isAnimatingRef.current = false;
      await channel.publish("deal-start", {
        startedAt: json.data.dealStartedAt,
      });
    } catch (error) {
      isAnimatingRef.current = false;
      renderCardsImmediately();
      console.error("Failed to deal cards:", error);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#145a32",
      }}
    >
      <button
        onClick={deal}
        style={{ position: "absolute", top: 12, left: 12, zIndex: 1 }}
      >
        deal cards
      </button>

      <Stage width={viewportSize.width} height={viewportSize.height}>
        <Layer
          ref={layerRef}
          x={offset.x}
          y={offset.y}
          scaleX={scale}
          scaleY={scale}
        >
          <Rect width={width} height={height} fill="#145a32" />

          <Ellipse
            x={layout.center.x}
            y={layout.center.y}
            radiusX={layout.radius * 1.6}
            radiusY={layout.radius * 1.1}
            fill="#de0efa"
          />

          {hasCards && room.phase !== "dealing" && (
            <Text
              text={statusText}
              x={layout.center.x - 110}
              y={layout.center.y - CARD_HEIGHT * 1.8}
              width={220}
              align="center"
              fontSize={16}
              fontStyle="bold"
              fill="white"
            />
          )}

          {seats.map((p) => (
            <Group key={p.id} x={p.x} y={p.y}>
              <Circle radius={32} fill="#222" />
              <Text
                text={room.players[p.id]?.nickname ?? p.id}
                fill="white"
                x={-70}
                y={40}
                width={140}
                height={18}
                align="center"
                wrap="none"
                ellipsis
              />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  );
});

RoomTable.displayName = "RoomTable";

export default RoomTable;
