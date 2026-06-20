import Konva from "konva";

export function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

export function waitForAnimation(
  layer: Konva.Layer,
  onFrame: (elapsed: number) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const animation = new Konva.Animation(() => {
      const active = onFrame(performance.now() - start);

      if (!active) {
        animation.stop();
        resolve();
      }
    }, layer);

    animation.start();
  });
}
