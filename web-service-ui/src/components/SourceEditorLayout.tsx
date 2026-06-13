import { For, type JSX } from 'solid-js';

export type SourceEditorRightTab = 'json' | 'debug' | 'list' | 'help';

export function SourceEditorLayout(props: {
  left: JSX.Element;
  toolbar: JSX.Element;
  rightTab: SourceEditorRightTab;
  onRightTabChange: (tab: SourceEditorRightTab) => void;
  jsonPanel: JSX.Element;
  debugPanel: JSX.Element;
  listPanel: JSX.Element;
  helpPanel: JSX.Element;
}) {
  const tabs: { key: SourceEditorRightTab; label: string }[] = [
    { key: 'json', label: 'JSON' },
    { key: 'debug', label: '调试' },
    { key: 'list', label: '源列表' },
    { key: 'help', label: '帮助' },
  ];

  const rightContent = () => {
    switch (props.rightTab) {
      case 'json':
        return props.jsonPanel;
      case 'debug':
        return props.debugPanel;
      case 'list':
        return props.listPanel;
      case 'help':
        return props.helpPanel;
      default:
        return props.jsonPanel;
    }
  };

  return (
    <div class="flex min-h-[calc(100vh-10rem)] overflow-hidden rounded-xl border border-border bg-card">
      <div class="min-w-0 flex-1 overflow-y-auto p-4">{props.left}</div>

      <div class="flex w-16 shrink-0 flex-col items-center gap-1 border-x border-border bg-muted/30 py-3">
        {props.toolbar}
      </div>

      <div class="flex w-[min(380px,38vw)] shrink-0 flex-col overflow-hidden">
        <div class="flex shrink-0 border-b border-border">
          <For each={tabs}>
            {(tab) => (
              <button
                type="button"
                class={`flex-1 px-2 py-2 text-xs font-medium transition ${props.rightTab === tab.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                onClick={() => props.onRightTabChange(tab.key)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">{rightContent()}</div>
      </div>
    </div>
  );
}

export function SourceEditorToolBtn(props: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={props.label}
      disabled={props.disabled}
      class={`flex w-12 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] transition hover:bg-accent disabled:opacity-40 ${props.active ? 'bg-accent font-medium' : ''}`}
      onClick={props.onClick}
    >
      <span class="text-base leading-none">{props.icon}</span>
      <span class="leading-tight">{props.label}</span>
    </button>
  );
}
