export type RoomTheme = "auto" | "day" | "night";
export type RoomPeriod = "day" | "night";
export type FurnitureId = "sofa" | "cushion";
export interface RoomPoint { x: number; y: number }
export const ROOM_ASPECT = 2048 / 1080;
// Interior of modal_bg.png; keep this geometry in sync with native room_point.
export const ROOM_FRAME_INSETS = { left: .046, right: .009, top: .164, bottom: .012 } as const;
export const ROOM_FRAME_ASPECT = ROOM_ASPECT * (1 - ROOM_FRAME_INSETS.top - ROOM_FRAME_INSETS.bottom)
  / (1 - ROOM_FRAME_INSETS.left - ROOM_FRAME_INSETS.right);
export const ROOM_BASE_WIDTH = 1024;
export const ROOM_MIN_SCALE = .20;
export type RoomResizeDirection = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";
export interface RoomWindowRect { x: number; y: number; width: number; height: number }
export function resizeRoomWindow(start: RoomWindowRect, direction: RoomResizeDirection, dx: number, dy: number): RoomWindowRect {
  const horizontal = direction.includes("East") ? 1 : direction.includes("West") ? -1 : 0;
  const vertical = direction.includes("South") ? 1 : direction.includes("North") ? -1 : 0;
  const fromWidth = start.width + horizontal * dx;
  const fromHeight = (start.height + vertical * dy) * ROOM_FRAME_ASPECT;
  const useWidth = horizontal !== 0 && (vertical === 0 || Math.abs(dx / start.width) >= Math.abs(dy / start.height));
  const width = Math.max(Math.ceil(ROOM_BASE_WIDTH * ROOM_MIN_SCALE), Math.round(useWidth ? fromWidth : fromHeight));
  const height = Math.round(width / ROOM_FRAME_ASPECT);
  return { width, height, x: start.x + (horizontal < 0 ? start.width - width : 0),
    y: start.y + (vertical < 0 ? start.height - height : 0) };
}
export function roomFrameBounds(width: number, height: number) {
  const frameWidth = Math.min(width, height * ROOM_FRAME_ASPECT), frameHeight = frameWidth / ROOM_FRAME_ASPECT;
  const left = (width - frameWidth) / 2, top = (height - frameHeight) / 2;
  return { left, top, width: frameWidth, height: frameHeight,
    scene: { left: left + frameWidth * ROOM_FRAME_INSETS.left, top: top + frameHeight * ROOM_FRAME_INSETS.top,
      width: frameWidth * (1 - ROOM_FRAME_INSETS.left - ROOM_FRAME_INSETS.right),
      height: frameHeight * (1 - ROOM_FRAME_INSETS.top - ROOM_FRAME_INSETS.bottom) } };
}
// Contact points calibrated on the 2048x1080 artwork: the middle of the sofa
// seat and the beanbag's V-shaped groove. Day/night share the furniture outlines.
export const FURNITURE_FACING = { sofa: "left", cushion: "right" } as const;
export const FURNITURE: Record<RoomPeriod, Record<FurnitureId, RoomPoint>> = {
  day: { sofa: { x: 1895 / 2048, y: 790 / 1080 }, cushion: { x: 297 / 2048, y: 868 / 1080 } },
  night: { sofa: { x: 1895 / 2048, y: 790 / 1080 }, cushion: { x: 297 / 2048, y: 868 / 1080 } },
};
export function roomPeriod(theme: RoomTheme, hour = new Date().getHours()): RoomPeriod {
  return theme === "auto" ? (hour >= 7 && hour < 19 ? "day" : "night") : theme;
}
// Feet stay on the open floor; furniture is reached only through a seat action.
export function clampFloor(point: RoomPoint): RoomPoint {
  return { x: Math.min(.85, Math.max(.25, Number.isFinite(point.x) ? point.x : .5)),
    y: Math.min(.95, Math.max(.80, Number.isFinite(point.y) ? point.y : .88)) };
}
export function furnitureAt(point: RoomPoint, period: RoomPeriod): FurnitureId | null {
  for (const id of ["sofa", "cushion"] as const) {
    const p = FURNITURE[period][id];
    if (Math.abs(point.x - p.x) <= (id === "sofa" ? .05 : .075)
      && point.y >= p.y - .12 && point.y <= p.y + .18) return id;
  }
  return null;
}
export function availableFurniture<T extends { id: string; furniture: FurnitureId | null }>(
  residents: Iterable<T>, furniture: FurnitureId, exceptId: string,
): boolean {
  return !Array.from(residents).some(r => r.id !== exceptId && r.furniture === furniture);
}
export function stepToward(from: RoomPoint, target: RoomPoint, distance: number): RoomPoint {
  // Measure movement in background-height units, preserving diagonal speed.
  const dx = (target.x - from.x) * ROOM_ASPECT, dy = target.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance || length === 0) return { ...target };
  return { x: from.x + dx / length * distance / ROOM_ASPECT, y: from.y + dy / length * distance };
}
