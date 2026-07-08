// Renders a recorded demo GIF from public/media, resolved against the Pages base path.
// Falls back to nothing if the asset is missing (e.g. before the recordings are generated).
import { useState } from "react";

export function Gif({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  const url = `${import.meta.env.BASE_URL}media/${src}`;
  return (
    <figure className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <img src={url} alt={alt} className="block w-full" loading="lazy" onError={() => setOk(false)} />
      {caption && <figcaption className="border-t border-black/5 px-4 py-2 text-center text-xs text-neutral-500">{caption}</figcaption>}
    </figure>
  );
}
