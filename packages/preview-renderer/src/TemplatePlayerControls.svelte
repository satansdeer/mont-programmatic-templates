<script lang="ts">
  import { onDestroy } from 'svelte';

  export let playheadMs = 0;
  export let durationMs = 1;
  export let playing = false;
  export let loop = true;
  export let disabled = false;
  export let showTime = true;

  let animationFrame = 0;
  let lastFrameTime = 0;

  $: clampedDurationMs = Math.max(1, durationMs);
  $: progressPercent = Math.max(0, Math.min(100, (playheadMs / clampedDurationMs) * 100));
  $: if (playheadMs > clampedDurationMs) {
    playheadMs = loop ? playheadMs % clampedDurationMs : clampedDurationMs;
  }
  $: {
    if (playing && !disabled && animationFrame === 0) {
      startAnimation();
    } else if ((!playing || disabled) && animationFrame !== 0) {
      stopAnimation();
    }
  }

  function togglePlayback(): void {
    if (disabled) return;
    playing = !playing;
  }

  function startAnimation(): void {
    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(stepPlayback);
  }

  function stopAnimation(): void {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function stepPlayback(now: number): void {
    if (!playing || disabled) {
      animationFrame = 0;
      return;
    }
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    const nextPlayheadMs = playheadMs + delta;
    if (loop) {
      playheadMs = nextPlayheadMs % clampedDurationMs;
    } else {
      playheadMs = Math.min(nextPlayheadMs, clampedDurationMs);
      if (nextPlayheadMs >= clampedDurationMs) playing = false;
    }
    animationFrame = requestAnimationFrame(stepPlayback);
  }

  function seek(event: Event): void {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    playheadMs = Number.isFinite(value) ? value : 0;
  }

  function formatSeconds(ms: number): string {
    return `${(ms / 1000).toFixed(2)}s`;
  }

  onDestroy(stopAnimation);
</script>

<div class="template-player" aria-label="Preview player">
  <button
    class="template-player-button"
    type="button"
    aria-label={playing ? 'Pause preview' : 'Play preview'}
    title={playing ? 'Pause' : 'Play'}
    on:click={togglePlayback}
    {disabled}
  >
    {#if playing}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    {/if}
  </button>
  <input
    class="template-player-seeker"
    type="range"
    min="0"
    max={clampedDurationMs}
    step="16"
    value={playheadMs}
    style={`--template-player-progress: ${progressPercent}%;`}
    aria-label="Playback position"
    on:input={seek}
    {disabled}
  />
  {#if showTime}
    <span class="template-player-time">{formatSeconds(playheadMs)} / {formatSeconds(clampedDurationMs)}</span>
  {/if}
</div>

<style>
  .template-player {
    width: 100%;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .template-player-button {
    width: 34px;
    min-width: 34px;
    height: 34px;
    min-height: 34px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--template-player-border, #cbd5e1);
    border-radius: 999px;
    background: var(--template-player-button-bg, #ffffff);
    color: var(--template-player-accent, #0f766e);
    cursor: pointer;
  }

  .template-player-button:hover,
  .template-player-button:focus-visible {
    border-color: var(--template-player-accent, #0f766e);
    outline: none;
  }

  .template-player-button:disabled,
  .template-player-seeker:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .template-player-button svg {
    width: 15px;
    height: 15px;
    fill: currentColor;
  }

  .template-player-seeker {
    width: 100%;
    min-width: 0;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .template-player-seeker::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 999px;
    background:
      linear-gradient(
        to right,
        var(--template-player-accent, #0f766e) 0,
        var(--template-player-accent, #0f766e) var(--template-player-progress, 0%),
        var(--template-player-track, #dbe3ee) var(--template-player-progress, 0%),
        var(--template-player-track, #dbe3ee) 100%
      );
  }

  .template-player-seeker::-moz-range-track {
    height: 4px;
    border-radius: 999px;
    background: var(--template-player-track, #dbe3ee);
  }

  .template-player-seeker::-moz-range-progress {
    height: 4px;
    border-radius: 999px;
    background: var(--template-player-accent, #0f766e);
  }

  .template-player-seeker::-webkit-slider-thumb {
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border: 2px solid var(--template-player-button-bg, #ffffff);
    border-radius: 999px;
    appearance: none;
    background: var(--template-player-accent, #0f766e);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22);
  }

  .template-player-seeker::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 2px solid var(--template-player-button-bg, #ffffff);
    border-radius: 999px;
    background: var(--template-player-accent, #0f766e);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22);
  }

  .template-player-time {
    min-width: 92px;
    color: var(--template-player-muted, #64748b);
    font-size: 12px;
    font-weight: 700;
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .template-player {
      grid-template-columns: 34px minmax(0, 1fr);
    }

    .template-player-time {
      display: none;
    }
  }
</style>
