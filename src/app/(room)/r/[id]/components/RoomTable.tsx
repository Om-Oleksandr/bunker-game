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
  Crown,
  Eye,
  FastForward,
  Play,
  Settings,
  Shield,
  Square,
  UserPlus,
  Users,
  X,
} from "lucide-react";
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
  cacheCardNode,
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

export interface RoomTableHandle {
  startDealAnimationFromOffset: (startedAt: number) => Promise<boolean>;
  animateSkippedCardReturn: (payload: IActiveCardPlay) => Promise<void>;
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipError, setSkipError] = useState("");
  const [membershipError, setMembershipError] = useState("");
  const [isChangingMembership, setIsChangingMembership] = useState(false);
  const [ambientGlow, setAmbientGlow] = useState(true);
  const [isLayerReady, setIsLayerReady] = useState(false);

  const layerRef = useRef<Konva.Layer>(null);
  const cardNodesRef = useRef<Map<string, Konva.Group>>(new Map());
  const isMountedRef = useRef(true);

  const isAnimatingRef = useRef(false);
  const animatedPlayStartedAtRef = useRef<number | null>(null);
  const playAnimationVersionRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const attachLayer = useCallback((layer: Konva.Layer | null) => {
    layerRef.current = layer;
    setIsLayerReady(Boolean(layer));
  }, []);

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
  const gameState = room.gameState ?? "idle";
  const isPlayer = Boolean(room.players[userId]);
  const isSpectator = !isPlayer && Boolean(room.spectators?.[userId]);
  const explanationEndsAt = room.activeCardPlay?.returnStartedAt ?? 0;
  const activePlayer = room.activeCardPlay
    ? room.players[room.activeCardPlay.seatId]
    : null;
  const activeCardWasPlayed = Boolean(
    activePlayer?.cards.some(
      ({ id, isPlayed }) => id === room.activeCardPlay?.cardId && isPlayed,
    ),
  );
  const canSkipTurn =
    room.activeCardPlay?.seatId === userId &&
    activeCardWasPlayed &&
    now < explanationEndsAt;
  const statusText =
    room.gameState === "idle"
      ? "Очікуємо початку гри"
      : room.activeCardPlay && now < explanationEndsAt
        ? `Час: ${Math.ceil((explanationEndsAt - now) / 1000)}s`
        : room.turnAvailableAt && now < room.turnAvailableAt
          ? `Наступний хід через ${Math.ceil((room.turnAvailableAt - now) / 1000)}s`
          : currentTurn === userId
            ? "Твій хід"
            : `Чекаємо на ${room.players[room.currentTurn].nickname}`;

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
        layer.listening(false);

        const { seatId, cardId, slotIndex, returnStartedAt, returnedAt } =
          payload;

        // Find the Konva node for this card (it was placed during deal animation)
        const node = cardNodesRef.current.get(cardId);
        if (!node) return;
        if (animatedPlayStartedAtRef.current === payload.startedAt) return;
        animatedPlayStartedAtRef.current = payload.startedAt;
        const animationVersion = ++playAnimationVersionRef.current;

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
            if (animationVersion !== playAnimationVersionRef.current)
              return false;
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
              if (animationVersion !== playAnimationVersionRef.current)
                return false;
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
              if (animationVersion !== playAnimationVersionRef.current)
                return false;
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

          if (animationVersion !== playAnimationVersionRef.current) return;

          // Step 3: return to the card's original hand position
          const returnDuration = Math.max(returnedAt - Date.now(), 1);
          await waitForAnimation(layer, (elapsed) => {
            if (animationVersion !== playAnimationVersionRef.current)
              return false;
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
        layerRef.current?.listening(true);
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
        cacheCardNode(group);

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
          cacheCardNode(group);

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
          cacheCardNode(group);

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
    if (!isLayerReady || !layerRef.current) return;
    if (isAnimatingRef.current) return;
    if (hasCards && room.phase !== "dealing") {
      renderCardsImmediately();
    }
  }, [
    hasCards,
    isLayerReady,
    renderCardsImmediately,
    room.phase,
    sceneSize.height,
    sceneSize.width,
  ]);

  const animateSkippedCardReturn = useCallback(
    async (payload: IActiveCardPlay) => {
      const layer = layerRef.current;
      const node = cardNodesRef.current.get(payload.cardId);
      const seat = getSeats().find(({ id }) => id === payload.seatId);
      if (!layer || !node || !seat) return;

      const playerCards = room.players[payload.seatId]?.cards ?? [];
      const cardIndex = playerCards.findIndex(
        ({ id }) => id === payload.cardId,
      );
      const localSlot = getSlotPositions(seat)[payload.slotIndex];
      const target = seat.isLocal
        ? localSlot
        : {
            x: getOpponentCardX(seat, cardIndex),
            y: getHandY(seat),
          };
      if (!target) return;

      const animationVersion = ++playAnimationVersionRef.current;
      animatedPlayStartedAtRef.current = payload.startedAt;
      const fromX = node.x();
      const fromY = node.y();
      const fromScaleX = node.scaleX();
      const fromScaleY = node.scaleY();
      const targetScale = seat.isLocal ? 1 : OPPONENT_CARD_SCALE;
      const distance = Math.hypot(target.x - fromX, target.y - fromY);

      node.off("click tap mouseenter mouseleave");
      isAnimatingRef.current = true;

      if (distance < 1) {
        layer.listening(true);
        isAnimatingRef.current = false;
        return;
      }

      const duration = Math.max(payload.returnedAt - Date.now(), 240);
      await waitForAnimation(layer, (elapsed) => {
        if (animationVersion !== playAnimationVersionRef.current) return false;

        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        node.x(fromX + (target.x - fromX) * easedProgress);
        node.y(fromY + (target.y - fromY) * easedProgress);
        node.scale({
          x: fromScaleX + (targetScale - fromScaleX) * easedProgress,
          y: fromScaleY + (targetScale - fromScaleY) * easedProgress,
        });
        return progress < 1;
      });

      if (animationVersion === playAnimationVersionRef.current) {
        node.position(target);
        node.scale({ x: targetScale, y: targetScale });
        layer.batchDraw();
        isAnimatingRef.current = false;
      }
      layer.listening(true);
    },
    [getSeats, room.players],
  );

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
          id: storeCard.id,
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
        cacheCardNode(group);

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

  const waitForLayer = useCallback(async () => {
    while (isMountedRef.current && !layerRef.current) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    return layerRef.current;
  }, []);

  const startDealAnimationFromOffset = async (startedAt: number) => {
    const layer = await waitForLayer();
    if (!layer) return false;
    layer.listening(false);
    isAnimatingRef.current = true;

    const elapsed = Date.now() - startedAt;
    const playerCount = Object.keys(room.players).length;
    const totalDuration = getTotalAnimationDuration(playerCount);

    // animation already finished — just render final state
    if (elapsed >= totalDuration) {
      renderCardsImmediately();
      layer.listening(true);
      isAnimatingRef.current = false;
      return true;
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
    layer.listening(true);
    isAnimatingRef.current = false;
    return true;
  };

  // ─── ABLY ──────────────────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    startDealAnimationFromOffset,
    animateCardPlay,
    animateSkippedCardReturn,
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
        body: JSON.stringify({ roomId, userId }),
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

  async function changeMembership() {
    if (gameState !== "idle" || isChangingMembership) return;

    const role = isSpectator ? "player" : "spectator";
    setIsChangingMembership(true);
    setMembershipError("");

    try {
      const response = await fetch(`/api/room/${roomId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const json: { data?: { role: string }; error?: string } =
        await response.json();
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Could not change role");
      }
      await channel.publish("role-changed", { userId, role });
    } catch (error) {
      setMembershipError(
        error instanceof Error ? error.message : "Could not change role",
      );
    } finally {
      setIsChangingMembership(false);
    }
  }

  async function endGame() {
    if (room.adminId !== userId || gameState !== "playing") return;

    setMembershipError("");
    try {
      const response = await fetch(`/api/room/${roomId}/game-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, gameState: "idle" }),
      });
      const json: { data?: { gameState: string }; error?: string } =
        await response.json();
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Could not end game");
      }
      await channel.publish("game-state-changed", { gameState: "idle" });
    } catch (error) {
      setMembershipError(
        error instanceof Error ? error.message : "Could not end game",
      );
    }
  }

  async function skipTurn() {
    if (!canSkipTurn || isSkipping) return;

    setIsSkipping(true);
    setSkipError("");

    try {
      const response = await fetch(`/api/room/${roomId}/skip-turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json: {
        data?: { play: IActiveCardPlay; turnAvailableAt: number };
        error?: string;
      } = await response.json();

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Could not skip turn");
      }

      setNow(explanationEndsAt);
      await channel.publish("turn-skipped", json.data);
    } catch (error) {
      setSkipError(
        error instanceof Error ? error.message : "Could not skip turn",
      );
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 overflow-hidden font-mono text-[#f2e8d2] ${
        ambientGlow
          ? "bg-[radial-gradient(circle_at_50%_35%,#263b32_0%,#111d19_48%,#070c0a_100%)]"
          : "bg-[#0c1512]"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-[#746046]/70 bg-[#101713]/90 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <Shield className="size-5 text-[#e8a52b]" aria-hidden />
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#998b75] uppercase">
              Кімната
            </p>
            <p className="font-mono text-sm font-bold tracking-[0.12em] text-[#f2e8d2]">
              {roomId}
            </p>
          </div>
          <span className="ml-2 flex items-center gap-1.5 border-l border-white/10 pl-3 text-xs text-[#b9ad98]">
            <Users className="size-3.5" aria-hidden />
            {Object.keys(room.players).length}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[#8f887c]">
            <Eye className="size-3.5" aria-hidden />
            {Object.keys(room.spectators ?? {}).length}
          </span>
        </div>

        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          {room.adminId === userId && gameState === "idle" && (
            <button
              type="button"
              onClick={deal}
              disabled={room.gameState === "playing"}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-[#806a48] bg-[#1b211c]/95 px-4 text-xs font-black tracking-[0.12em] text-[#eadab9] uppercase shadow-lg transition hover:border-[#d4962c] hover:text-[#ffbd4a] disabled:cursor-wait disabled:opacity-45"
            >
              <Play className="size-4 fill-current" aria-hidden />
              Почати гру
            </button>
          )}
          {room.adminId === userId && gameState === "playing" && (
            <button
              type="button"
              onClick={endGame}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-red-900/70 bg-red-950/80 px-4 text-xs font-black tracking-[0.12em] text-red-200 uppercase transition hover:border-red-600 hover:bg-red-900/80"
            >
              <Square className="size-3.5 fill-current" aria-hidden />
              Закінчити гру
            </button>
          )}
          <button
            type="button"
            onClick={changeMembership}
            disabled={gameState === "playing" || isChangingMembership}
            title={
              gameState === "playing"
                ? "Недоступно під час гри"
                : isSpectator
                  ? "Грати"
                  : "Спостерігати"
            }
            className="inline-flex h-11 items-center gap-2 rounded-md border border-[#665b49] bg-[#161d19]/95 px-4 text-xs font-black tracking-[0.12em] text-[#d8c9ad] uppercase shadow-lg transition hover:border-[#d4962c] hover:text-[#ffbd4a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSpectator ? (
              <UserPlus className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
            {isChangingMembership
              ? "Оновлення…"
              : isSpectator
                ? "Грати"
                : "Спостерігати"}
          </button>
          {isPlayer && (
            <button
              type="button"
              onClick={skipTurn}
              disabled={!canSkipTurn || isSkipping}
              title={
                canSkipTurn
                  ? "Завершити хід та пояснення"
                  : "Доступно після ходу"
              }
              className="inline-flex h-11 items-center gap-2 rounded-md border border-[#d08b27] bg-[linear-gradient(180deg,#e8a52b,#a95f16)] px-4 text-xs font-black tracking-[0.12em] text-[#1a1208] uppercase shadow-[0_0_20px_rgba(232,165,43,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-[#4c4941] disabled:bg-[#252823] disabled:text-[#706d64] disabled:shadow-none"
            >
              <FastForward className="size-4" aria-hidden />
              {isSkipping ? "Пропускаємо…" : "Пропустити"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsSettingsOpen((open) => !open)}
            aria-expanded={isSettingsOpen}
            aria-label="Open table settings"
            className="grid size-11 place-items-center rounded-md border border-[#665b49] bg-[#161d19]/95 text-[#c9bda8] shadow-lg transition hover:border-[#d4962c] hover:text-[#ffbd4a]"
          >
            <Settings className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {(skipError || membershipError) && (
        <p
          role="alert"
          className="absolute top-20 right-6 z-30 rounded-md border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-xl"
        >
          {skipError || membershipError}
        </p>
      )}

      {isSettingsOpen && (
        <aside className="absolute top-20 right-4 z-30 w-[min(22rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-[#6d5b42] bg-[linear-gradient(145deg,rgba(29,35,30,0.98),rgba(10,15,13,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:right-6">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#a6977d] uppercase">
                Ігрова зона
              </p>
              <h2 className="mt-1 font-black tracking-[0.08em] text-[#f0dfbd] uppercase">
                Налаштування столу
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              aria-label="Close settings"
              className="grid size-8 place-items-center rounded-md text-[#a99e8c] transition hover:bg-white/5 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-3 p-5">
            <button
              type="button"
              aria-pressed={ambientGlow}
              onClick={() => setAmbientGlow((enabled) => !enabled)}
              className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-[#a77c39]/60"
            >
              <span>
                <span className="block text-sm font-bold text-[#e5d6ba]">
                  Навколишнє світіння столу
                </span>
                <span className="mt-0.5 block text-xs text-[#8f887c]">
                  Додає глибини навколо ігрового полотна
                </span>
              </span>
              <span
                className={`relative h-6 w-11 rounded-full transition ${ambientGlow ? "bg-[#d28d25]" : "bg-[#343832]"}`}
              >
                <span
                  className={`absolute top-1 size-4 rounded-full bg-[#fff3d7] transition-transform ${ambientGlow ? "translate-x-6" : "translate-x-1"}`}
                />
              </span>
            </button>

            <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#908778]">
              <span className="flex items-center gap-2">
                {room.adminId === userId ? (
                  <Crown className="size-4 text-[#e8a52b]" aria-hidden />
                ) : (
                  <Shield className="size-4" aria-hidden />
                )}
                {room.adminId === userId
                  ? `Адмін · ${isSpectator ? "Спостерігач" : "Гравець"}`
                  : isSpectator
                    ? "Спостерігач"
                    : "Гравець"}
              </span>
              <span className="uppercase">{gameState}</span>
            </div>
          </div>
        </aside>
      )}

      {viewportSize.width > 0 && viewportSize.height > 0 && (
        <Stage width={viewportSize.width} height={viewportSize.height}>
          <Layer
            x={offset.x}
            y={offset.y}
            scaleX={scale}
            scaleY={scale}
            listening={false}
          >
            <Ellipse
              x={layout.center.x}
              y={layout.center.y}
              radiusX={layout.radius * 1.68}
              radiusY={layout.radius * 1.18}
              fill="#070b09"
              shadowColor="#000000"
              shadowBlur={ambientGlow ? 45 : 18}
              shadowOpacity={0.85}
            />
            <Ellipse
              x={layout.center.x}
              y={layout.center.y}
              radiusX={layout.radius * 1.6}
              radiusY={layout.radius * 1.1}
              fillRadialGradientStartPoint={{ x: 0, y: -30 }}
              fillRadialGradientStartRadius={10}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndRadius={layout.radius * 1.5}
              fillRadialGradientColorStops={[
                0,
                ambientGlow ? "#334b3e" : "#29362f",
                0.58,
                "#1b2c25",
                1,
                "#0c1713",
              ]}
              stroke="#765a36"
              strokeWidth={9}
              shadowColor={ambientGlow ? "#c6872d" : "#000000"}
              shadowBlur={ambientGlow ? 16 : 5}
              shadowOpacity={0.28}
            />
            <Ellipse
              x={layout.center.x}
              y={layout.center.y}
              radiusX={layout.radius * 1.46}
              radiusY={layout.radius * 0.96}
              stroke="#9b7748"
              strokeWidth={1}
              opacity={0.35}
            />

            {hasCards && room.phase !== "dealing" && (
              <Group>
                <Rect
                  x={layout.center.x - 145}
                  y={layout.center.y - CARD_HEIGHT * 1.93}
                  width={290}
                  height={36}
                  cornerRadius={8}
                  fill="#0a100d"
                  stroke="#775a35"
                  strokeWidth={1}
                  opacity={0.94}
                />
                <Text
                  text={statusText}
                  x={layout.center.x - 135}
                  y={layout.center.y - CARD_HEIGHT * 1.84}
                  width={270}
                  align="center"
                  fontFamily="Arial Black"
                  fontSize={13}
                  letterSpacing={0.8}
                  fill="#f2c76e"
                />
              </Group>
            )}

            {seats.map((seat) => {
              const player = room.players[seat.id];
              if (!player) return null;
              const isActive = currentTurn === seat.id;
              return (
                <Group
                  key={seat.id}
                  x={seat.x}
                  y={seat.y}
                  opacity={player.isVotedOut ? 0.35 : 1}
                >
                  {isActive && (
                    <Circle
                      radius={40}
                      stroke="#f0a72d"
                      strokeWidth={2}
                      shadowColor="#f0a72d"
                      shadowBlur={18}
                      shadowOpacity={0.75}
                    />
                  )}
                  <Circle
                    radius={34}
                    fill={seat.isLocal ? "#68451e" : "#17221d"}
                    stroke={isActive ? "#f0b84a" : "#806b4b"}
                    strokeWidth={3}
                    shadowColor="#000000"
                    shadowBlur={10}
                    shadowOpacity={0.6}
                  />
                  <Text
                    text={(player.nickname || "?").slice(0, 1).toUpperCase()}
                    fill={seat.isLocal ? "#ffcf72" : "#d9c8a7"}
                    x={-30}
                    y={-15}
                    width={60}
                    align="center"
                    fontFamily="Arial Black"
                    fontSize={27}
                  />
                  <Rect
                    x={-66}
                    y={42}
                    width={130}
                    height={28}
                    cornerRadius={7}
                    fill="#0b110e"
                    stroke={isActive ? "#bd8430" : "#534c3e"}
                    strokeWidth={1}
                    opacity={0.96}
                  />
                  <Text
                    text={`${player.nickname}${seat.isLocal ? " · YOU" : ""}`}
                    fill={isActive ? "#ffd27b" : "#eee1c8"}
                    x={-70}
                    y={49}
                    width={140}
                    height={16}
                    align="center"
                    wrap="none"
                    ellipsis
                    fontStyle="bold"
                    fontSize={12}
                  />
                </Group>
              );
            })}
          </Layer>
          <Layer
            ref={attachLayer}
            x={offset.x}
            y={offset.y}
            scaleX={scale}
            scaleY={scale}
          />
        </Stage>
      )}
    </div>
  );
});

RoomTable.displayName = "RoomTable";

export default RoomTable;
