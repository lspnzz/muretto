"use client";

import { useLiveData } from "@/hooks/useLiveData";

/** Mounts the SSE/replay engine once. Renders nothing. */
export function LiveDataProvider() {
  useLiveData();
  return null;
}
