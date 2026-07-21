/**
 * 「记住的选择」偏好配置：导入存放、删除文件、替换策略等
 * 可按 scope 嵌入主设置或各模块设置页
 */

import { Show, createSignal, type JSX } from 'solid-js';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Button } from '@/components/ui/button';
import { settingsState, settingsStore } from '@/stores/settings';
import {
  clearCloseWindowAction,
  closeWindowActionLabel,
  readCloseWindowAction,
  writeCloseWindowAction,
  type CloseWindowAction,
} from '@/lib/settings/close-action-prefs';
import {
  clearImmersiveToastDismissal,
  getImmersiveToastDismissalStatus,
  immersiveToastDismissalLabel,
} from '@/lib/settings/immersive-toast-prefs';
import {
  clearAllUserApiUpdatePrefs,
  hasActiveUserApiUpdateSuppression,
} from '@/lib/media/audio/online/user-api-update-prefs';
import { persistImportMediaAction } from '@/lib/media/local-media-import';
import { isTauri } from '@/lib/platform/detect';

export type RememberedChoicesScope =
  | 'main'
  | 'reader'
  | 'music'
  | 'video'
  | 'window'
  | 'toast'
  | 'user-api';

type ImportAction = 'copy' | 'move' | 'none';
type ReplaceAction = 'replace' | 'skip' | 'restore-existing' | 'rename-import';

const IMPORT_OPTIONS: ImportAction[] = ['copy', 'move', 'none'];
const IMPORT_LABELS: Record<ImportAction, string> = {
  copy: '复制到库目录',
  move: '移动到库目录',
  none: '无动作（引用原位置）',
};

const REPLACE_OPTIONS: ReplaceAction[] = [
  'replace',
  'skip',
  'restore-existing',
  'rename-import',
];
const REPLACE_LABELS: Record<ReplaceAction, string> = {
  replace: '替换原文件',
  skip: '跳过导入',
  'restore-existing': '恢复已存在的书籍',
  'rename-import': '重命名导入',
};

const CLOSE_OPTIONS: CloseWindowAction[] = ['hide', 'quit'];

function PreferenceCard(props: {
  title: string;
  description?: string;
  /** card：主设置卡片壳；plain：模块设置页透出背景/壁纸，与旁邻区块一致 */
  variant?: 'card' | 'plain';
  children: JSX.Element;
}) {
  const isCard = () => (props.variant ?? 'card') === 'card';
  return (
    <div
      class={
        isCard()
          ? 'rounded-2xl border border-border/50 bg-card p-6'
          : 'space-y-3'
      }
    >
      <div class={isCard() ? 'mb-4 space-y-1' : undefined}>
        <h3
          class={
            isCard()
              ? 'font-semibold text-foreground'
              : 'text-sm font-semibold text-foreground'
          }
        >
          {props.title}
        </h3>
        <Show when={props.description}>
          <p
            class={
              isCard()
                ? 'text-sm text-muted-foreground'
                : 'mt-1 text-xs text-muted-foreground'
            }
          >
            {props.description}
          </p>
        </Show>
      </div>
      <div class="space-y-4">{props.children}</div>
    </div>
  );
}

function RememberSwitchRow(props: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: JSX.Element;
}) {
  return (
    <div class="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 space-y-0.5">
          <p class="text-sm font-medium text-foreground">{props.title}</p>
          <p class="text-xs text-muted-foreground">{props.description}</p>
        </div>
        <AppSwitch checked={props.checked} onChange={(v) => props.onChange(!!v)}>
          <AppSwitchControl class="shrink-0">
            <AppSwitchThumb />
          </AppSwitchControl>
          <AppSwitchLabel class="sr-only">{props.title}</AppSwitchLabel>
        </AppSwitch>
      </div>
      <Show when={props.checked && props.children}>
        <div class="border-t border-border/40 pt-3">{props.children}</div>
      </Show>
    </div>
  );
}

function ImportActionPreference(props: {
  kind: 'book' | 'music' | 'video';
  title: string;
  description: string;
}) {
  const remembered = () => {
    const app = settingsState.app;
    if (props.kind === 'book') return app.rememberImportAction === true;
    if (props.kind === 'music') return app.rememberImportAudioAction === true;
    return app.rememberImportVideoAction === true;
  };
  const action = (): ImportAction => {
    const app = settingsState.app;
    if (props.kind === 'book') return app.importBookAction || 'copy';
    if (props.kind === 'music') return app.importAudioAction || 'copy';
    return app.importVideoAction || 'copy';
  };

  const persist = async (nextAction: ImportAction, remember: boolean) => {
    if (props.kind === 'book') {
      await settingsStore.setImportBookAction(nextAction, remember);
      return;
    }
    await persistImportMediaAction(props.kind, nextAction, remember);
  };

  return (
    <RememberSwitchRow
      id={`remember-import-${props.kind}`}
      title={props.title}
      description={props.description}
      checked={remembered()}
      onChange={(checked) => void persist(action(), checked)}
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">默认操作</span>
        <AppSelect
          value={action()}
          options={IMPORT_OPTIONS}
          onChange={(v) => void persist(v as ImportAction, true)}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {IMPORT_LABELS[itemProps.item.rawValue as ImportAction]}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            id={`import-action-${props.kind}`}
            layout="form"
            class="w-52"
            aria-label={props.title}
          >
            <AppSelectValue<ImportAction>>
              {(state) => IMPORT_LABELS[state.selectedOption() as ImportAction]}
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </div>
    </RememberSwitchRow>
  );
}

function DeleteFilePreference(props: {
  variant: 'book' | 'download';
}) {
  const remembered = () =>
    props.variant === 'book'
      ? settingsState.app.rememberDeleteFileAction === true
      : settingsState.app.rememberDeleteDownloadFileAction === true;
  const deleteFile = () =>
    props.variant === 'book'
      ? settingsState.app.deleteFileAction === true
      : settingsState.app.deleteDownloadFileAction === true;

  const title =
    props.variant === 'book'
      ? '删除书籍时删除本地文件'
      : '移除下载记录时删除本地文件';
  const description =
    props.variant === 'book'
      ? '关闭后，下次删除本地书籍会再次询问是否删除文件。'
      : '关闭后，下次移除已完成下载任务会再次询问是否删除文件。';

  const persist = async (nextDelete: boolean, remember: boolean) => {
    if (props.variant === 'book') {
      await settingsStore.setDeleteFileAction(nextDelete, remember);
      return;
    }
    await settingsStore.setDeleteDownloadFileAction(nextDelete, remember);
  };

  return (
    <RememberSwitchRow
      id={`remember-delete-${props.variant}`}
      title={title}
      description={description}
      checked={remembered()}
      onChange={(checked) => void persist(deleteFile(), checked)}
    >
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0 space-y-0.5">
          <p class="text-sm font-medium text-foreground">默认同时删除本地文件</p>
          <p class="text-xs text-muted-foreground">开启后静默按此偏好执行；关闭则仅移除记录。</p>
        </div>
        <AppSwitch
          checked={deleteFile()}
          onChange={(v) => void persist(!!v, true)}
        >
          <AppSwitchControl class="shrink-0">
            <AppSwitchThumb />
          </AppSwitchControl>
          <AppSwitchLabel class="sr-only">默认同时删除本地文件</AppSwitchLabel>
        </AppSwitch>
      </div>
    </RememberSwitchRow>
  );
}

function ReplaceFilePreference() {
  const remembered = () => settingsState.app.rememberReplaceFile === true;
  const action = (): ReplaceAction =>
    settingsState.app.replaceExistingFile || 'replace';

  return (
    <RememberSwitchRow
      id="remember-replace-file"
      title="导入时文件已存在"
      description="关闭后，下次导入冲突会再次弹出选择对话框。"
      checked={remembered()}
      onChange={(checked) => void settingsStore.setReplaceFileAction(action(), checked)}
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">默认操作</span>
        <AppSelect
          value={action()}
          options={REPLACE_OPTIONS}
          onChange={(v) => void settingsStore.setReplaceFileAction(v as ReplaceAction, true)}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {REPLACE_LABELS[itemProps.item.rawValue as ReplaceAction]}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            id="replace-file-action"
            layout="form"
            class="w-52"
            aria-label="文件已存在时的操作"
          >
            <AppSelectValue<ReplaceAction>>
              {(state) => REPLACE_LABELS[state.selectedOption() as ReplaceAction]}
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </div>
    </RememberSwitchRow>
  );
}

export function CloseWindowActionPreference() {
  const [saved, setSaved] = createSignal(readCloseWindowAction());
  const remembered = () => saved() != null;

  const refresh = () => setSaved(readCloseWindowAction());

  return (
    <RememberSwitchRow
      id="remember-close-action"
      title="关闭窗口时的行为"
      description={
        settingsState.app.closeToTray
          ? '当前已开启「关闭到托盘」，关闭按钮会直接隐藏窗口；关闭该开关后才会使用此处记住的选择。'
          : '关闭后，下次点关闭按钮会再次询问隐藏到托盘或退出。'
      }
      checked={remembered()}
      onChange={(checked) => {
        if (checked) {
          writeCloseWindowAction(saved() ?? 'hide');
        } else {
          clearCloseWindowAction();
        }
        refresh();
      }}
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">默认操作</span>
        <AppSelect
          value={saved() ?? 'hide'}
          options={CLOSE_OPTIONS}
          onChange={(v) => {
            writeCloseWindowAction(v as CloseWindowAction);
            refresh();
          }}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {closeWindowActionLabel(itemProps.item.rawValue as CloseWindowAction)}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            id="close-window-action"
            layout="form"
            class="w-44"
            aria-label="关闭窗口时的行为"
          >
            <AppSelectValue<CloseWindowAction>>
              {(state) =>
                closeWindowActionLabel(state.selectedOption() as CloseWindowAction)
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
      </div>
    </RememberSwitchRow>
  );
}

export function ImmersiveToastPreference() {
  const [status, setStatus] = createSignal(getImmersiveToastDismissalStatus());
  const dismissed = () => status().kind !== 'none';

  return (
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2.5">
      <div class="min-w-0 flex-1 space-y-0.5">
        <p class="text-sm font-medium text-foreground">沉浸模式进入提示</p>
        <p class="text-xs text-muted-foreground">{immersiveToastDismissalLabel(status())}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!dismissed()}
        onClick={() => {
          clearImmersiveToastDismissal();
          setStatus(getImmersiveToastDismissalStatus());
        }}
      >
        恢复提示
      </Button>
    </div>
  );
}

export function UserApiUpdateMutePreference() {
  const [active, setActive] = createSignal(hasActiveUserApiUpdateSuppression());

  return (
    <div class="space-y-2 rounded-lg border border-border/40 bg-muted/20 p-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1 space-y-0.5">
          <p class="text-sm font-medium text-foreground">自定义源更新提示静音</p>
          <p class="text-xs text-muted-foreground">
            {active()
              ? '当前存在「7 天内不再提示 / 忽略本次 / 全局静音」记录。'
              : '当前没有生效的更新提示静音记录。'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!active()}
          onClick={() => {
            clearAllUserApiUpdatePrefs();
            setActive(hasActiveUserApiUpdateSuppression());
          }}
        >
          清除静音
        </Button>
      </div>
    </div>
  );
}

export function RememberedChoicesSetting(props: { scope: RememberedChoicesScope }) {
  if (props.scope === 'toast') return <ImmersiveToastPreference />;
  if (props.scope === 'window') return <CloseWindowActionPreference />;
  if (props.scope === 'user-api') return <UserApiUpdateMutePreference />;

  return (
    <PreferenceCard
      variant={props.scope === 'main' ? 'card' : 'plain'}
      title="记住的选择"
      description="管理对话框中勾选「记住我的选择」后保存的偏好；关闭开关后下次操作会重新询问。"
    >
      <Show when={props.scope === 'main' || props.scope === 'reader'}>
        <ImportActionPreference
          kind="book"
          title="导入书籍存放方式"
          description="关闭后，下次本地导入书籍会再次询问复制 / 移动 / 无动作。"
        />
        <DeleteFilePreference variant="book" />
        <ReplaceFilePreference />
      </Show>
      <Show when={props.scope === 'main' || props.scope === 'music'}>
        <ImportActionPreference
          kind="music"
          title="导入音频存放方式"
          description="关闭后，下次本地导入音频会再次询问复制 / 移动 / 无动作。"
        />
        <DeleteFilePreference variant="download" />
      </Show>
      <Show when={props.scope === 'main' || props.scope === 'video'}>
        <ImportActionPreference
          kind="video"
          title="导入视频存放方式"
          description="关闭后，下次本地导入视频会再次询问复制 / 移动 / 无动作。"
        />
      </Show>
      <Show when={props.scope === 'main' && isTauri()}>
        <CloseWindowActionPreference />
      </Show>
    </PreferenceCard>
  );
}
