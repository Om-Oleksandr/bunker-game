import {
  CARD_CONTENT_WIDTH,
  CARD_HEIGHT,
  CARD_LEFT,
  CARD_TOP,
  CARD_WIDTH,
  CATEGORY_HEIGHT,
  NAME_HEIGHT,
  NAME_TOP,
} from "@/common/cards";
import Konva from "konva";

function getCardNameFontSize(text: string) {
  const length = Array.from(text).length;

  if (length > 56) return 8;
  if (length > 42) return 9;
  if (length > 30) return 10;
  if (length > 20) return 11;

  return 12;
}

export function createCardRect(fill: string) {
  return new Konva.Rect({
    name: "cardRect",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    offsetX: CARD_WIDTH / 2,
    offsetY: CARD_HEIGHT / 2,
    cornerRadius: 6,
    fill,
    shadowBlur: 6,
  });
}

export function createCardTextNodes(
  name: string,
  category: string,
  revealed: boolean,
) {
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

export function cacheCardNode(node: Konva.Group) {
  const nameText = node.findOne(".cardNameText") as Konva.Text | undefined;
  node.setAttr("isFaceRevealed", Boolean(nameText?.text()));
  node.clearCache();
  node.cache({ pixelRatio: Math.max(Konva.pixelRatio, 2) });
}

export function revealCardText(node: Konva.Group) {
  if (node.getAttr("isFaceRevealed")) return;

  const cardName = node.getAttr("cardName") as string;
  const cardCategory = node.getAttr("cardCategory") as string;
  const nameText = node.findOne(".cardNameText") as Konva.Text | undefined;
  const categoryText = node.findOne(".cardCategoryText") as
    | Konva.Text
    | undefined;

  nameText?.text(cardName);
  nameText?.fontSize(getCardNameFontSize(cardName));
  categoryText?.text(cardCategory);
  node.setAttr("isFaceRevealed", true);
  node.clearCache();
  node.cache({ pixelRatio: Math.max(Konva.pixelRatio, 2) });
}

export function getCardPayload(node: Konva.Group) {
  return {
    seatId: node.getAttr("seatId") as string,
    name: node.getAttr("cardName") as string,
    category: node.getAttr("cardCategory") as string,
  };
}
