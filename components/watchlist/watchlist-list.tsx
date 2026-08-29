"use client";

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { WatchlistRow } from "@/components/watchlist/watchlist-row";
import { useWatchlist } from "@/components/watchlist/watchlist-provider";
import type { CandleRange } from "@/lib/market-data/types";

/** The watchlist as a drag-to-reorder list. */
export function WatchlistList({ range }: { range: CandleRange }) {
  const { items, reorder } = useWatchlist();

  const sensors = useSensors(
    // Desktop: a little travel before a drag starts. Touch: press and hold
    // briefly, so a normal swipe still scrolls the page.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.symbol === active.id);
    const to = items.findIndex((item) => item.symbol === over.id);
    if (from === -1 || to === -1) return;

    reorder(arrayMove(items, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.symbol)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <WatchlistRow key={item.symbol} item={item} range={range} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
