// Shared in-process presence state.
// server.ts mutates this map; chatService.ts reads it.
// Both import from here to avoid circular dependencies.
export const onlineUsers = new Map<string, Set<string>>();

export function isUserOnline(userId: string): boolean {
  return (onlineUsers.get(userId)?.size ?? 0) > 0;
}
