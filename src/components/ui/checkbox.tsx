import type { ValidComponent } from "solid-js"
import { Match, splitProps, Switch } from "solid-js"

import * as CheckboxPrimitive from "@kobalte/core/checkbox"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"

import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "@/components/shared/icons"

type CheckboxRootProps<T extends ValidComponent = "div"> =
  CheckboxPrimitive.CheckboxRootProps<T> & { class?: string | undefined }

const Checkbox = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, CheckboxRootProps<T>>
) => {
  const [local, others] = splitProps(props as CheckboxRootProps, ["class", "id"])
  return (
    <CheckboxPrimitive.Root
      class={cn("group relative inline-flex shrink-0 items-start", local.class)}
      {...others}
    >
      <CheckboxPrimitive.Input id={local.id} class="peer sr-only" />
      <CheckboxPrimitive.Control class="size-4 shrink-0 rounded-sm border border-primary ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 data-checked:border-none data-indeterminate:border-none data-checked:bg-primary data-indeterminate:bg-primary data-checked:text-primary-foreground data-indeterminate:text-primary-foreground">
        <CheckboxPrimitive.Indicator>
          <Switch>
            <Match when={!others.indeterminate}>
              <CheckIcon class="size-4" />
            </Match>
            <Match when={others.indeterminate}>
              <MinusIcon class="size-4" />
            </Match>
          </Switch>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Control>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
