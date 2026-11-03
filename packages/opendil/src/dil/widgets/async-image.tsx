"use client";
import { useCallback, useState } from "react";
export interface AsyncImageProps {
  query: string;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
/** Offline illustration. A host-mode component override can supply an image service. */
export function AsyncImage({ query, presentationRef }: AsyncImageProps) {
  const [failed, setFailed] = useState(false);
  const error = useCallback(() => setFailed(true), []);
  const hue = query.includes("butterfly")
    ? 310
    : query.includes("mountain")
      ? 160
      : 225;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="hsl(${hue},35%,92%)"/><circle cx="470" cy="95" r="45" fill="hsl(${hue},50%,65%)"/><path d="M0 360 180 120 340 320 450 180 640 360Z" fill="hsl(${hue},35%,45%)"/></svg>`;
  return (
    <div
      ref={presentationRef}
      className="aspect-video w-full overflow-hidden rounded-xl bg-muted"
    >
      {failed ? (
        <div role="status">Image unavailable</div>
      ) : (
        <img
          src={"data:image/svg+xml," + encodeURIComponent(svg)}
          alt={query}
          onError={error}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
