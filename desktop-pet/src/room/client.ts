import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CharacterId } from "../characters/types";
export interface RoomMember { id: CharacterId; x: number; y: number }
export interface RoomSnapshot { revision: number; visible: boolean; members: RoomMember[] }
export const getRoom = () => invoke<RoomSnapshot>("get_room_state");
export const showRoom = () => invoke<RoomSnapshot>("show_room_window");
export const closeRoom = () => invoke<RoomSnapshot>("close_room_window");
export const enterRoom = (id: CharacterId) => invoke<RoomSnapshot>("invite_to_room", { id });
export const leaveRoom = (id: CharacterId, atCursor = false) => invoke<RoomSnapshot>("leave_room", { id, atCursor });
export const subscribeRoom = (handler: (s: RoomSnapshot) => void) =>
  listen<RoomSnapshot>("room-state", e => handler(e.payload));
