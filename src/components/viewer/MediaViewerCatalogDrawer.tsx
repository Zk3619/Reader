import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import {
  mediaViewerCatalogDrawerContentClass,
  mediaViewerCatalogDrawerSide,
} from '@/lib/viewer/media-viewer-catalog-drawer';

export interface MediaViewerCatalogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  onSelectChapter: (index: number) => void;
}

export function MediaViewerCatalogDrawer(props: MediaViewerCatalogDrawerProps) {
  const side = () => mediaViewerCatalogDrawerSide();

  return (
    <ViewerAppDrawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      side={side()}
      snapPoints={[0, 1]}
      defaultSnapPoint={1}
    >
      <ViewerAppDrawerContent
        class={mediaViewerCatalogDrawerContentClass(side())}
        showNativeDragHandle={false}
      >
        <ViewerAppDrawerHeader title="目录" />
        <ViewerAppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
          <MediaViewerCatalog
            open={props.open}
            loading={props.loading}
            onSelectChapter={props.onSelectChapter}
            drawerBottom={side() === 'bottom'}
          />
        </ViewerAppDrawerBody>
      </ViewerAppDrawerContent>
    </ViewerAppDrawer>
  );
}
