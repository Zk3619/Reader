import { settingsStore } from '@/stores/settings';
import { Label } from '@/components/ui/label';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { applyThemeToDocument } from '@/lib/theme';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function ThemeScheduleSetting() {
  const dayHour = () => settingsStore.state.app.themeScheduleDayHour ?? 6;
  const nightHour = () => settingsStore.state.app.themeScheduleNightHour ?? 18;

  const updateHours = async (patch: { day?: number; night?: number }) => {
    await settingsStore.setThemeScheduleHours({
      dayStartHour: patch.day ?? dayHour(),
      nightStartHour: patch.night ?? nightHour(),
    });
    if (settingsStore.state.app.theme === 'schedule') {
      applyThemeToDocument('schedule');
    }
  };

  const hourSelect = (props: {
    id: string;
    label: string;
    value: () => number;
    onChange: (hour: number) => void;
  }) => (
    <div class="space-y-2">
      <Label for={props.id}>{props.label}</Label>
      <AppSelect
        value={String(props.value())}
        onChange={(v) => {
          const hour = Number(v);
          if (Number.isFinite(hour)) props.onChange(hour);
        }}
        options={HOUR_OPTIONS.map(String)}
        itemComponent={(itemProps) => (
          <AppSelectItem item={itemProps.item}>
            {formatHour(Number(itemProps.item.rawValue))}
          </AppSelectItem>
        )}
      >
        <AppSelectTrigger id={props.id} aria-label={props.label}>
          <AppSelectValue<string>>
            {(state) => formatHour(Number(state.selectedOption() ?? props.value()))}
          </AppSelectValue>
          <AppSelectIcon />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectListbox />
        </AppSelectContent>
      </AppSelect>
    </div>
  );

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="space-y-1">
        <h3 class="font-semibold text-foreground">主题按时切换</h3>
        <p class="text-sm text-muted-foreground">
          在主题模式选择「按时」时，本地时区在浅色开始至深色开始之间使用浅色，其余时间使用深色。
        </p>
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        {hourSelect({
          id: 'theme-schedule-day-hour',
          label: '浅色开始',
          value: dayHour,
          onChange: (hour) => void updateHours({ day: hour }),
        })}
        {hourSelect({
          id: 'theme-schedule-night-hour',
          label: '深色开始',
          value: nightHour,
          onChange: (hour) => void updateHours({ night: hour }),
        })}
      </div>
    </div>
  );
}
