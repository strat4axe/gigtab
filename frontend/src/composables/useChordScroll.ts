import { ref, watch, onUnmounted, type Ref } from "vue";

export function useChordScroll(scrollContainer: Ref<HTMLElement | null>) {
  const isScrolling = ref(false);
  const songDurationMs = ref(180_000); // default 3 minutes
  let animationId: number | null = null;

  // Track the "plan": we scroll from scrollOrigin to scrollMax over remainingMs
  let scrollOrigin = 0;
  let remainingMs = 0;
  let segmentStart = 0; // performance.now() when current segment began

  // Detect user-initiated scroll (touch swipe) vs programmatic scroll
  let userTouching = false;
  let programmaticScroll = false;

  function getScrollMax(): number {
    if (!scrollContainer.value) return 0;
    return scrollContainer.value.scrollHeight - scrollContainer.value.clientHeight;
  }

  function start() {
    if (!scrollContainer.value) return;
    isScrolling.value = true;
    scrollOrigin = scrollContainer.value.scrollTop;
    remainingMs = songDurationMs.value;
    segmentStart = performance.now();
    bindEvents();
    tick();
  }

  function tick() {
    if (!isScrolling.value || !scrollContainer.value) return;

    const elapsed = performance.now() - segmentStart;
    const progress = Math.min(elapsed / remainingMs, 1);
    const scrollMax = getScrollMax();
    const target = scrollOrigin + (scrollMax - scrollOrigin) * progress;

    programmaticScroll = true;
    scrollContainer.value.scrollTop = target;
    programmaticScroll = false;

    if (progress < 1) {
      animationId = requestAnimationFrame(tick);
    } else {
      stop();
    }
  }

  // When the user swipes (touchstart/touchend), recalculate the segment
  // so auto-scroll resumes from the new position with adjusted remaining time.
  function onTouchStart() {
    userTouching = true;
    // Pause animation while finger is on screen
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function onTouchEnd() {
    userTouching = false;
    if (!isScrolling.value || !scrollContainer.value) return;

    // Calculate how much time has elapsed in the current segment
    const elapsed = performance.now() - segmentStart;
    const newRemaining = Math.max(remainingMs - elapsed, 1000); // at least 1s left

    // Start a new segment from current scroll position
    scrollOrigin = scrollContainer.value.scrollTop;
    remainingMs = newRemaining;
    segmentStart = performance.now();
    tick();
  }

  // Also handle mouse wheel / non-touch scroll adjustments
  function onScroll() {
    if (programmaticScroll || userTouching || !isScrolling.value) return;

    // User scrolled via wheel or other means — same logic as touch end
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (!scrollContainer.value) return;
    const elapsed = performance.now() - segmentStart;
    const newRemaining = Math.max(remainingMs - elapsed, 1000);

    scrollOrigin = scrollContainer.value.scrollTop;
    remainingMs = newRemaining;
    segmentStart = performance.now();
    tick();
  }

  function bindEvents() {
    const el = scrollContainer.value;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
  }

  function unbindEvents() {
    const el = scrollContainer.value;
    if (!el) return;
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("scroll", onScroll);
  }

  function stop() {
    isScrolling.value = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    unbindEvents();
  }

  function toggle() {
    isScrolling.value ? stop() : start();
  }

  onUnmounted(stop);

  return { isScrolling, songDurationMs, start, stop, toggle };
}
