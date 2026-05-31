/**
 * 网格单元：按实体 key 挂载；item 按 flatIndex/entityKey 解析，不订阅整表 Map。
 */

import { Show, createMemo, type Accessor, type JSX } from 'solid-js';
import type { Id } from '@thisbeyond/solid-dnd';

function resolveEntityItem<T>(
  orderedItems: Accessor<readonly T[]>,
  entityKey: string,
  flatIndex: Accessor<number>,
  itemSortableId: (item: T, index: number) => Id,
): T | undefined {
  const list = orderedItems();
  const i = flatIndex();
  if (i >= 0 && i < list.length) {
    const at = list[i]!;
    if (String(itemSortableId(at, i)) === entityKey) return at;
  }
  for (let j = 0; j < list.length; j++) {
    const at = list[j]!;
    if (String(itemSortableId(at, j)) === entityKey) return at;
  }
  return undefined;
}

function VirtualGridEntityCellBody<T>(props: {
  item: Accessor<T>;
  flatIndex: Accessor<number>;
  entityKey: string;
  renderByKey?: (itemKey: string, flatIndex: Accessor<number>) => JSX.Element;
  renderEntityByKey?: (entityKey: string) => JSX.Element;
  children?: (item: T, index: number) => JSX.Element;
}) {
  const index = () => props.flatIndex();
  if (props.renderEntityByKey) {
    return <>{props.renderEntityByKey(props.entityKey)}</>;
  }
  return (
    <>
      {props.renderByKey
        ? props.renderByKey(props.entityKey, props.flatIndex)
        : props.children?.(props.item(), index())}
    </>
  );
}

export function VirtualGridEntityCell<T>(props: {
  entityKey: string;
  flatIndex: Accessor<number>;
  orderedItems: Accessor<readonly T[]>;
  itemSortableId: (item: T, index: number) => Id;
  renderByKey?: (itemKey: string, flatIndex: Accessor<number>) => JSX.Element;
  renderEntityByKey?: (entityKey: string) => JSX.Element;
  children?: (item: T, index: number) => JSX.Element;
}) {
  const item = createMemo(() =>
    resolveEntityItem(
      props.orderedItems,
      props.entityKey,
      props.flatIndex,
      props.itemSortableId,
    ),
  );

  if (props.renderEntityByKey) {
    return (
      <Show when={item()}>
        <VirtualGridEntityCellBody
          item={item as Accessor<T>}
          flatIndex={props.flatIndex}
          entityKey={props.entityKey}
          renderEntityByKey={props.renderEntityByKey}
        />
      </Show>
    );
  }

  return (
    <Show when={item()}>
      <VirtualGridEntityCellBody
        item={item as Accessor<T>}
        flatIndex={props.flatIndex}
        entityKey={props.entityKey}
        renderByKey={props.renderByKey}
        children={props.children}
      />
    </Show>
  );
}
