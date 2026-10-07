<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/i18n';
import { useReviewStore, type ParticipantRole } from '@/stores/review';

const open = defineModel<boolean>('open', { required: true });

const review = useReviewStore();
const { m } = useI18n();
const name = ref('');

/** People named in the ADRs who are not participants yet. */
const suggestions = computed(() => {
  const taken = new Set(review.participants.map((person) => person.name.toLowerCase()));
  return review.knownPeople.filter((person) => !taken.has(person.toLowerCase()));
});

function add(): void {
  review.addParticipant(name.value);
  name.value = '';
}

function setRole(person: string, value: unknown): void {
  if (value === 'decider' || value === 'consulted') review.setParticipantRole(person, value satisfies ParticipantRole);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="font-display text-2xl font-normal">{{ m.participants.title }}</DialogTitle>
        <DialogDescription>{{ m.participants.description }}</DialogDescription>
      </DialogHeader>

      <form class="flex gap-2" @submit.prevent="add">
        <Input v-model="name" :placeholder="m.participants.placeholder" :aria-label="m.participants.placeholder" autofocus />
        <Button type="submit" variant="secondary" :disabled="name.trim() === ''"><Plus /> {{ m.participants.add }}</Button>
      </form>

      <ul v-if="review.participants.length > 0" class="divide-y rounded-lg border" :aria-label="m.participants.title">
        <li v-for="person in review.participants" :key="person.name" class="flex items-center gap-3 px-3 py-2">
          <span class="min-w-0 flex-1 truncate">{{ person.name }}</span>
          <ToggleGroup :model-value="person.role" type="single" size="sm" @update:model-value="(value) => setRole(person.name, value)">
            <ToggleGroupItem value="decider" class="px-2.5 text-xs data-[state=on]:bg-secondary">{{ m.participants.decider }}</ToggleGroupItem>
            <ToggleGroupItem value="consulted" class="px-2.5 text-xs data-[state=on]:bg-secondary">{{ m.participants.consulted }}</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="m.participants.remove(person.name)" @click="review.removeParticipant(person.name)">
            <X />
          </Button>
        </li>
      </ul>
      <p v-else class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{{ m.participants.none }}</p>

      <section v-if="suggestions.length > 0">
        <h3 class="mb-2 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">{{ m.participants.known }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <Button v-for="person in suggestions" :key="person" variant="outline" size="xs" @click="review.addParticipant(person)"><Plus /> {{ person }}</Button>
        </div>
      </section>

      <DialogFooter>
        <Button v-if="review.participants.length > 0" variant="ghost" @click="review.$patch({ participants: [] })">{{ m.participants.clear }}</Button>
        <Button @click="open = false">{{ m.participants.done }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
