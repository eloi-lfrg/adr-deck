<script setup lang="ts">
import type { Status } from '@adr/format';
import { computed, nextTick, ref } from 'vue';
import { CalendarClock, Check, Clock, RefreshCcw, X } from '@lucide/vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const props = defineProps<{ adrId: string; selected: string[]; hint: string | null }>();
const emit = defineEmits<{ decide: [status: Status]; rework: [actions: string[]] }>();
const comment = defineModel<string>('comment', { required: true });
const nextReview = defineModel<string>('nextReview', { required: true });

const { m } = useI18n();
const commentField = ref<HTMLTextAreaElement | null>(null);
const dateField = ref<HTMLInputElement | null>(null);
const showDate = ref(nextReview.value !== '');
/** Rework mode: the comment gives way to the list of actions. */
const reworking = ref(false);
const actions = ref('');
const actionsField = ref<HTMLTextAreaElement | null>(null);

async function startRework(): Promise<void> {
  reworking.value = true;
  await nextTick();
  actionsField.value?.focus();
}

function cancelRework(): void {
  reworking.value = false;
  actions.value = '';
}

function sendBack(): void {
  emit('rework', actions.value.split('\n'));
}
const canValidate = computed(() => props.selected.length > 0);
const selectionLabel = computed(() => props.selected.join(', '));

async function revealDate(): Promise<void> {
  showDate.value = true;
  await nextTick();
  dateField.value?.focus();
}

const base =
  'inline-flex items-center gap-2 rounded-lg border px-[1.1cqw] py-[0.55cqw] text-[max(18px,1cqw)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

defineExpose({ focusComment: () => commentField.value?.focus(), startRework, cancelRework });
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-[1.4cqw] gap-y-3">
    <div class="flex gap-[0.6cqw]" role="group" :aria-label="m.decision.group(adrId)">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            :aria-disabled="!canValidate"
            :aria-label="m.decision.acceptLabel(adrId, selectionLabel)"
            :class="
              cn(
                base,
                canValidate
                  ? 'border-transparent bg-status-accepted font-semibold text-background hover:bg-status-accepted/90'
                  : 'border-border text-foreground hover:border-status-accepted hover:bg-status-accepted-bg',
              )
            "
            @click="emit('decide', 'validée')"
          >
            <Check class="size-[1em]" :class="!canValidate && 'text-status-accepted'" /> {{ m.decision.accept }}
          </button>
        </TooltipTrigger>
        <TooltipContent>V</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            :aria-label="m.decision.rejectLabel(adrId)"
            :class="cn(base, 'border-border text-foreground hover:border-status-rejected hover:bg-status-rejected-bg hover:text-status-rejected')"
            @click="emit('decide', 'refusée')"
          >
            <X class="size-[1em] text-status-rejected" /> {{ m.decision.reject }}
          </button>
        </TooltipTrigger>
        <TooltipContent>X</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            :aria-label="m.decision.deferLabel(adrId)"
            :class="cn(base, 'border-border text-foreground hover:border-status-deferred hover:bg-status-deferred-bg hover:text-status-deferred')"
            @click="emit('decide', 'reportée')"
          >
            <Clock class="size-[1em] text-status-deferred" /> {{ m.decision.defer }}
          </button>
        </TooltipTrigger>
        <TooltipContent>P</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            :aria-label="m.decision.reworkLabel(adrId)"
            :aria-pressed="reworking"
            :class="cn(base, 'border-border text-foreground hover:border-primary hover:bg-accent', reworking && 'border-primary bg-accent')"
            @click="reworking ? cancelRework() : startRework()"
          >
            <RefreshCcw class="size-[1em] text-primary" /> {{ m.decision.rework }}
          </button>
        </TooltipTrigger>
        <TooltipContent>W</TooltipContent>
      </Tooltip>
    </div>

    <p v-if="hint" class="text-[max(16px,0.9cqw)] text-status-rejected" role="alert">{{ hint }}</p>

    <div v-if="reworking" class="flex min-w-[16rem] flex-1 items-end gap-2">
      <textarea
        ref="actionsField"
        v-model="actions"
        rows="2"
        :aria-label="m.decision.actionsLabel(adrId)"
        :placeholder="m.decision.actions"
        class="min-w-[12rem] flex-1 resize-none rounded-md border border-border bg-transparent px-2 py-1 text-[max(18px,1cqw)] leading-snug outline-none field-sizing-content placeholder:text-muted-foreground/60 focus:border-primary"
        @keydown.enter.exact.prevent="sendBack"
        @keydown.esc.stop.prevent="cancelRework"
      />
      <button type="button" :class="cn(base, 'border-transparent bg-primary font-semibold text-primary-foreground hover:bg-primary/90')" @click="sendBack">
        {{ m.decision.saveActions }}
      </button>
      <button type="button" class="rounded-lg px-3 py-1.5 text-[max(16px,0.9cqw)] text-muted-foreground hover:bg-muted hover:text-foreground" @click="cancelRework">
        {{ m.decision.cancel }}
      </button>
    </div>
    <textarea
      v-else
      ref="commentField"
      v-model="comment"
      rows="1"
      :aria-label="m.decision.commentLabel(adrId)"
      :placeholder="m.decision.comment"
      class="min-w-[12rem] flex-1 resize-none border-b border-transparent bg-transparent py-1 text-[max(18px,1cqw)] leading-snug outline-none field-sizing-content placeholder:text-muted-foreground/60 hover:border-border focus:border-primary"
      @keydown.enter.exact.prevent="($event.target as HTMLTextAreaElement).blur()"
    />

    <label v-if="showDate && !reworking" class="flex items-center gap-2 text-[max(16px,0.9cqw)] text-muted-foreground">
      <CalendarClock class="size-[1em]" aria-hidden="true" />
      <span class="sr-only">{{ m.decision.nextReview }}</span>
      <input ref="dateField" v-model="nextReview" type="date" class="bg-transparent text-foreground outline-none [color-scheme:inherit]" />
    </label>
    <Tooltip v-else-if="!reworking">
      <TooltipTrigger as-child>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          :aria-label="m.decision.addNextReview"
          @click="revealDate"
        >
          <CalendarClock class="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{{ m.decision.nextReviewTooltip }}</TooltipContent>
    </Tooltip>
  </div>
</template>
