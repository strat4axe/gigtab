<script setup>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

const props = defineProps({
    playing: {
        type: Boolean,
        required: true,
    },
    isLooping: {
        type: Boolean,
        required: true,
    },
    enableCountIn: {
        type: Boolean,
        required: true,
    },
    enableMetronome: {
        type: Boolean,
        required: true,
    },
    speed: {
        type: Number,
        required: true,
    },
    playbackRange: {
        default: null,
    },
    currentAudio: {
        type: String,
        required: true,
    },
    // Chord/lyric sheet: loop, count-in and metronome do not apply
    isText: {
        type: Boolean,
        default: false,
    },
});

const SPEED_MIN = 50;
const SPEED_MAX = 150;
const SPEED_STEP = 5;

function setSpeed(value) {
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(Number(value) / SPEED_STEP) * SPEED_STEP));
    emit("update:speed", clamped);
}

const emit = defineEmits([
    "play-pause",
    "play-from-highlighted",
    "toggle-loop",
    "toggle-count-in",
    "toggle-metronome",
    "update:speed",
]);
</script>

<template>
    <button class="btn btn-warning" @click='emit("play-from-highlighted")' v-if="playbackRange">
        <font-awesome-icon :icon='["fas", "play"]' />
        Restart
    </button>

    <button class="btn btn-primary" @click='emit("play-pause")' :class="{ active: playing }">
        <span v-if="!playing">
            <font-awesome-icon :icon='["fas", "play"]' />
            Play
        </span>
        <span v-else>
            <font-awesome-icon :icon='["fas", "pause"]' />
            Pause
        </span>
    </button>

    <button class="btn btn-secondary" @click='emit("toggle-loop")' :class="{ active: isLooping }" v-if="!isText">
        <font-awesome-icon :icon='["fas", "check"]' v-if="isLooping" />
        Loop
    </button>

    <button class="btn btn-secondary" @click='emit("toggle-count-in")' :class='{ active: enableCountIn, disabled: currentAudio !== "synth" }' v-if="!isText">
        <font-awesome-icon :icon='["fas", "check"]' v-if="enableCountIn" />
        Count in
    </button>

    <button class="btn btn-secondary" @click='emit("toggle-metronome")' :class='{ active: enableMetronome, disabled: currentAudio !== "synth" }' v-if="!isText">
        <font-awesome-icon :icon='["fas", "check"]' v-if="enableMetronome" />
        Metronome
    </button>

    <div class="speed-control">
        <button class="btn btn-secondary speed-step" aria-label="Slower" :disabled="speed <= SPEED_MIN" @click="setSpeed(speed - SPEED_STEP)">−</button>
        <div class="speed-slider">
            <input
                type="range"
                :min="SPEED_MIN"
                :max="SPEED_MAX"
                :step="SPEED_STEP"
                list="speed-ticks"
                :value="speed"
                aria-label="Speed"
                @input="setSpeed($event.target.value)"
            />
            <datalist id="speed-ticks">
                <option value="75"></option>
                <option value="100"></option>
                <option value="125"></option>
            </datalist>
            <div class="speed-marks" aria-hidden="true">
                <span @click="setSpeed(75)">0.75×</span>
                <span @click="setSpeed(100)">1×</span>
                <span @click="setSpeed(125)">1.25×</span>
            </div>
        </div>
        <button class="btn btn-secondary speed-step" aria-label="Faster" :disabled="speed >= SPEED_MAX" @click="setSpeed(speed + SPEED_STEP)">+</button>
        <button class="btn speed-value" :class='speed === 100 ? "btn-secondary" : "btn-warning"' title="Tap to reset to normal speed" @click="setSpeed(100)">
            {{ (speed / 100).toFixed(2) }}×
        </button>
    </div>
</template>

<style scoped lang="scss">
.speed-control {
    display: flex;
    align-items: center;
    gap: 6px;

    .speed-step {
        min-width: 44px;
        font-size: 20px;
        line-height: 1;
    }

    .speed-value {
        min-width: 72px;
        font-variant-numeric: tabular-nums;
    }
}

.speed-slider {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 180px;

    input[type="range"] {
        width: 100%;
        height: 28px;
        margin: 0;
        touch-action: pan-y;
    }
}

// 0.75 / 1 / 1.25 sit at 25% / 50% / 75% of a 0.5 - 1.5 range
.speed-marks {
    position: relative;
    height: 14px;
    font-size: 11px;
    color: #c8c8c8;
    user-select: none;

    span {
        position: absolute;
        transform: translateX(-50%);
        cursor: pointer;
        white-space: nowrap;
    }

    span:nth-child(1) {
        left: 25%;
    }

    span:nth-child(2) {
        left: 50%;
    }

    span:nth-child(3) {
        left: 75%;
    }
}
</style>
