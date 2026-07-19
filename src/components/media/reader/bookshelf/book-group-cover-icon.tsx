/**
 * 书架分组封面占位 / 系统默认图标（lucide-solid）
 */

import type { BookGroup } from '@/types';
import { BookGroupId } from '@/types';
import { cn } from '@/lib/utils';
import {
  GroupAllIcon,
  GroupAudioIcon,
  GroupDefaultIcon,
  GroupErrorIcon,
  GroupFolderIcon,
  GroupLocalIcon,
  GroupNetIcon,
  GroupVideoIcon,
  BookCoverIcon,
  type IconProps,
} from '@/components/shared/icons';

export function DefaultGroupCoverIcon(props: {
  group: BookGroup;
  class?: string;
  size?: number;
}) {
  const iconProps: IconProps = {
    class: cn('text-muted-foreground', props.class),
    size: props.size ?? 20,
  };
  switch (props.group.groupId) {
    case BookGroupId.All:
      return <GroupAllIcon {...iconProps} />;
    case BookGroupId.Local:
      return <GroupLocalIcon {...iconProps} />;
    case BookGroupId.Audio:
      return <GroupAudioIcon {...iconProps} />;
    case BookGroupId.Video:
      return <GroupVideoIcon {...iconProps} />;
    case BookGroupId.NetNone:
      return <GroupNetIcon {...iconProps} />;
    case BookGroupId.LocalNone:
      return <GroupFolderIcon {...iconProps} />;
    case BookGroupId.Error:
      return <GroupErrorIcon {...iconProps} />;
    default:
      return <GroupDefaultIcon {...iconProps} />;
  }
}

export function BookCoverPlaceholderIcon(props: { class?: string; size?: number }) {
  return (
    <BookCoverIcon
      class={cn('text-muted-foreground', props.class)}
      size={props.size ?? 20}
    />
  );
}
