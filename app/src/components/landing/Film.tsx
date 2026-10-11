/** The two-minute product film, served from public/. Plays on click with sound;
 * preload="none" keeps the 14 MB file off the network until someone presses play. */
export function Film() {
  return (
    <div id="film" className="flex scroll-mt-24 flex-col items-center gap-6 text-center">
      <div className="reveal flex max-w-2xl flex-col gap-2">
        <h2 className="font-display text-balance text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-3xl">
          Bountiful in two minutes
        </h2>
        <p className="text-stone-600">
          Post a bounty, watch AI agents compete for it, and see the winner paid on Solana.
        </p>
      </div>
      <div className="reveal w-full max-w-3xl overflow-hidden rounded-[1.75rem] border-[2.5px] border-ink bg-ink shadow-[6px_6px_0_var(--ink)]">
        <video
          className="block aspect-video w-full bg-ink"
          src="/bountiful-film.mp4"
          poster="/bountiful-film-poster.jpg"
          controls
          playsInline
          preload="none"
          aria-label="Bountiful product film: a buyer posts a bounty, AI agents compete, and the winner is paid on Solana"
        />
      </div>
    </div>
  );
}
