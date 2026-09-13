"use client";

import { useRef, useState } from "react";

function getYouTubeId(url: string): string | null {
  if (!url || url.includes("PASTE_")) return null;
  const patterns = [
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/watch\?v=([\w-]{11})/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return match[1];
  }
  return null;
}

function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url || "");
}

export default function VideoEmbed({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const id = getYouTubeId(src);

  if (isVideoFile(src)) {
    return (
      <div
        className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black"
        onClick={() => {
          videoRef.current?.play();
          setActive(true);
        }}
      >
        {!active && (
          <div className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-3 bg-primary/70 backdrop-blur-[2px]">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary shadow-xl transition-transform hover:scale-105"
              aria-hidden="true"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="ml-1 h-8 w-8"
              >
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
              </svg>
            </span>
            <span className="text-sm font-bold text-white">Tap to play</span>
          </div>
        )}
        <video
          ref={videoRef}
          src={src}
          title={title}
          controls
          preload="metadata"
          playsInline
          className="absolute inset-0 h-full w-full"
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-3xl bg-primary px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="ml-1 h-7 w-7"
          >
            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
          </svg>
        </span>
        <div>
          <p className="font-bold text-white">Video coming soon</p>
          <p className="mt-1 text-sm text-white/60">
            Connect with us for a live walkthrough and site visit.
          </p>
        </div>
      </div>
    );
  }

  const embedParams = active
    ? "?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1"
    : `?autoplay=1&mute=1&playsinline=1&controls=0&loop=1&playlist=${id}&rel=0&modestbranding=1`;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${id}${embedParams}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
      {!active && (
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label="Enable sound and controls"
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="rounded-full bg-background/90 px-4 py-2 text-xs font-bold text-primary shadow-lg">
            Tap to enable sound
          </span>
        </button>
      )}
    </div>
  );
}