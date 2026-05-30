import { closestCenter, type CollisionDetector, type Id } from '@thisbeyond/solid-dnd';
import { createContext, useContext } from 'solid-js';
import { clampIndex } from '@/components/shared/virtual-list/virtual-sortable-coordinates';

export type VirtualSortableTargetResolver = (ctx: {
  scrollEl: HTMLElement;
  pointerX: number;
  pointerY: number;
}) => number;

export interface VirtualSortableCoordinateSession {
  setPointer: (x: number, y: number) => void;
  createCollisionDetector: (options: {
    scrollContainer: () => HTMLElement | undefined;
    ids: () => Id[];
    resolveTargetIndex?: () => VirtualSortableTargetResolver | undefined;
  }) => CollisionDetector;
}

export function createVirtualSortableCoordinateSession(): VirtualSortableCoordinateSession {
  let pointerX = 0;
  let pointerY = 0;

  return {
    setPointer(x: number, y: number) {
      pointerX = x;
      pointerY = y;
    },
    createCollisionDetector(options) {
      return (draggable, droppables, context) => {
        const scroll = options.scrollContainer();
        const ids = options.ids();
        const resolve = options.resolveTargetIndex?.();

        if (!scroll || ids.length === 0 || !resolve) {
          return closestCenter(draggable, droppables, context);
        }

        const targetIndex = resolve({
          scrollEl: scroll,
          pointerX,
          pointerY,
        });
        const id = ids[clampIndex(targetIndex, ids.length)];
        if (id == null) return null;

        // 仅 id 参与 SortableProvider 重排；无需挂载对应 droppable DOM
        return { id } as ReturnType<CollisionDetector>;
      };
    },
  };
}

const VirtualSortableCoordinateContext =
  createContext<VirtualSortableCoordinateSession>();

export function useVirtualSortableCoordinateSession() {
  return useContext(VirtualSortableCoordinateContext);
}

export { VirtualSortableCoordinateContext };
