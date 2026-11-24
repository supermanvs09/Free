import { useEffect, useRef, useState } from 'react';
import { Icon, cx } from './ui.jsx';

/* The product overview, the way enterprise security sites present theirs:
   a "Watch" button that opens the video in a lightbox over the page, played
   only on request, with captions. The page underneath keeps its place; Esc,
   the close button or a click outside closes it and stops the video. */
export function WatchButton({ label = 'Watch the overview', duration = '1:26', className, ...video }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={cx('group inline-flex h-[52px] items-center gap-3 rounded-full border border-line-2 bg-bg-1/80 pl-1.5 pr-5 text-[15.5px] font-semibold text-ink backdrop-blur transition-colors hover:border-fg/30', className)}>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0a6dbb] text-white shadow-[0_8px_20px_-8px_rgb(10_109_187/.8)] transition-transform duration-300 group-hover:scale-[1.06]">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
        </span>
        {label}<span className="font-medium text-ink-3">{duration}</span>
      </button>
      {open && <VideoModal onClose={() => setOpen(false)} {...video} />}
    </>
  );
}

export function VideoModal({ onClose, src = '/video/deep-algorithms-film', poster = '/video/film-poster.webp', captions = '/video/deep-algorithms-film.vtt', title = 'Deep Algorithms platform overview' }) {
  const dlg = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const d = dlg.current;
    d?.showModal?.();
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = ''; };
  }, []);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog ref={dlg} aria-label={title} onClose={onClose} onCancel={onClose}
      onClick={(e) => { if (e.target === dlg.current) dlg.current.close(); }}
      className="vmodal m-auto w-[min(1120px,calc(100vw-32px))] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-[rgb(6_10_16/.82)] backdrop:backdrop-blur-sm">
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-4 text-white">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
          <button type="button" onClick={() => dlg.current?.close()} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="Close video">
            <Icon name="X" size={18} weight="bold" />
          </button>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-[0_60px_120px_-40px_rgb(0_0_0/.9)]">
          {failed ? (
            <div className="absolute inset-0 grid place-items-center p-8 text-center text-white">
              <div>
                <Icon name="Warning" size={36} className="mx-auto text-white/60" />
                <p className="mt-4 text-[18px] font-semibold">The overview video could not be loaded.</p>
                <p className="mt-2 text-[15px] text-white/70">Book a demo and an engineer will walk you through the platform live.</p>
                <a href="/request-demo" className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-[#12171f]">Book a demo</a>
              </div>
            </div>
          ) : (
            <video className="absolute inset-0 h-full w-full" poster={poster} controls autoPlay playsInline preload="auto" onError={() => setFailed(true)}>
              <source src={`${src}.webm`} type="video/webm" />
              <source src={`${src}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
              <track kind="captions" src={captions} srcLang="en" label="English" />
            </video>
          )}
        </div>
      </div>
    </dialog>
  );
}
