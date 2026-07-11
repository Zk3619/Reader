import { ColorPicker } from '@/components/ui/color-picker';

export interface ThemeStudioColorFieldProps {
  value: string;
  label: string;
  onChange: (hex: string) => void;
  showAlpha?: boolean;
}

export function ThemeStudioColorField(props: ThemeStudioColorFieldProps) {
  return (
    <div class="flex items-center gap-2">
      <ColorPicker
        variant="minimal"
        triggerVariant="icon"
        size="sm"
        showAlpha={props.showAlpha ?? false}
        defaultFormat="hex"
        outputFormat="hex"
        value={props.value}
        onChange={(hex) => props.onChange(hex)}
        aria-label={props.label}
        class="shrink-0"
      />
      <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{props.label}</span>
    </div>
  );
}
