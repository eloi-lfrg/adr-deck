interface ViewTransitionLike {
  finished: Promise<void>;
}

type StartViewTransition = (update: () => Promise<void>) => ViewTransitionLike;

/** Runs `update` inside a View Transition when supported and motion is allowed. */
export async function withViewTransition(update: () => Promise<void>): Promise<void> {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!start || reduced) {
    await update();
    return;
  }
  await start.call(document, update).finished;
}
