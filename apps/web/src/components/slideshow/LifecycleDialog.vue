<script setup lang="ts">
import { DecisionError, type Adr } from '@adr/format';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { Check } from '@lucide/vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { useReviewStore } from '@/stores/review';

/** `supersede`: « superseded by » another ADR; `deprecate`: no longer applies. Both keep the decision. */
const props = defineProps<{ adr: Adr; mode: 'supersede' | 'deprecate' }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ done: [] }>();

const review = useReviewStore();
const { m } = useI18n();
const target = ref<string | null>(null);
const reason = ref('');

/** Candidates: every other ADR, newest first (a replacement is usually recent). */
const candidates = computed(() => [...review.adrs].filter((adr) => adr.id !== props.adr.id).reverse());

watch(open, (value) => {
  if (!value) return;
  target.value = null;
  reason.value = '';
});

function confirm(): void {
  const comment = reason.value.trim() || null;
  try {
    if (props.mode === 'supersede') {
      if (target.value === null) {
        toast.error(m.value.decisionErrors.replacementRequired());
        return;
      }
      review.supersede(props.adr.id, target.value, comment);
      toast.success(m.value.lifecycle.superseded(props.adr.id, target.value));
    } else {
      review.deprecate(props.adr.id, comment);
      toast.success(m.value.lifecycle.deprecated(props.adr.id));
    }
  } catch (error) {
    if (!(error instanceof DecisionError)) throw error;
    toast.error(m.value.decisionErrors[error.code](error.params));
    return;
  }
  open.value = false;
  emit('done');
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="font-display text-2xl font-normal">
          {{ mode === 'supersede' ? m.lifecycle.supersedeTitle(adr.id) : m.lifecycle.deprecateTitle(adr.id) }}
        </DialogTitle>
        <DialogDescription>{{ mode === 'supersede' ? m.lifecycle.supersedeDescription : m.lifecycle.deprecateDescription }}</DialogDescription>
      </DialogHeader>

      <div v-if="mode === 'supersede'" class="space-y-2">
        <p class="text-sm font-medium">{{ m.lifecycle.target }}</p>
        <Command class="rounded-lg border" :aria-label="m.lifecycle.target">
          <CommandInput :placeholder="m.lifecycle.targetPlaceholder" />
          <CommandList class="max-h-56">
            <CommandEmpty>{{ m.palette.empty }}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                v-for="candidate in candidates"
                :key="candidate.id"
                :value="`${candidate.id} ${candidate.title}`"
                class="gap-3"
                :aria-selected="target === candidate.id"
                @select="target = candidate.id"
              >
                <Check class="size-4" :class="target === candidate.id ? 'text-primary' : 'invisible'" aria-hidden="true" />
                <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{{ candidate.id }}</span>
                <span class="min-w-0 flex-1 truncate">{{ candidate.title }}</span>
                <StatusBadge :status="candidate.status" size="sm" />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>

      <label class="block space-y-2">
        <span class="text-sm font-medium">{{ m.lifecycle.reason }}</span>
        <Input v-model="reason" @keydown.enter.prevent="confirm" />
      </label>

      <DialogFooter>
        <Button variant="ghost" @click="open = false">{{ m.lifecycle.cancel }}</Button>
        <Button :disabled="mode === 'supersede' && target === null" @click="confirm">
          {{ mode === 'supersede' ? m.lifecycle.confirmSupersede : m.lifecycle.confirmDeprecate }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
