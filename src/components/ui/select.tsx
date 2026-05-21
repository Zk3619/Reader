import type { Component, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as SelectPrimitive from "@kobalte/core/select"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"

import { cn } from "@/lib/utils"
import { CheckIcon, ChevronsUpDownIcon } from "@/components/shared/icons"

const Select = SelectPrimitive.Root

type SelectValueProps<T extends ValidComponent = "span"> =
  SelectPrimitive.SelectValueProps<T> & { class?: string | undefined }

const SelectValue = <T extends ValidComponent = "span">(
  props: PolymorphicProps<T, SelectValueProps<T>>
) => {
  const [local, others] = splitProps(props as SelectValueProps, ["class"])
  return (
    <SelectPrimitive.Value
      class={cn("", local.class)}
      {...others}
    />
  )
}

type SelectTriggerProps<T extends ValidComponent = "button"> =
  SelectPrimitive.SelectTriggerProps<T> & { class?: string | undefined }

const SelectTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, SelectTriggerProps<T>>
) => {
  const [local, others] = splitProps(props as SelectTriggerProps, ["class"])
  return (
    <SelectPrimitive.Trigger
      class={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        local.class
      )}
      {...others}
    />
  )
}

const SelectIcon: Component<SelectPrimitive.SelectIconProps> = (props) => {
  return (
    <SelectPrimitive.Icon {...props}>
      <ChevronsUpDownIcon class="h-4 w-4 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  )
}

type SelectContentProps<T extends ValidComponent = "div"> =
  SelectPrimitive.SelectContentProps<T> & { class?: string | undefined }

const SelectContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, SelectContentProps<T>>
) => {
  const [local, others] = splitProps(props as SelectContentProps, ["class"])
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={cn(
          "relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-expanded:animate-in data-closed:animate-out data-closed:fade-out-0 data-expanded:fade-in-0 data-closed:zoom-out-95 data-expanded:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          local.class
        )}
        {...others}
      />
    </SelectPrimitive.Portal>
  )
}

type SelectListboxProps<T extends ValidComponent = "ul"> =
  SelectPrimitive.SelectListboxProps<T> & { class?: string | undefined }

const SelectListbox = <T extends ValidComponent = "ul">(
  props: PolymorphicProps<T, SelectListboxProps<T>>
) => {
  const [local, others] = splitProps(props as SelectListboxProps, ["class"])
  return (
    <SelectPrimitive.Listbox
      class={cn("p-1", local.class)}
      {...others}
    />
  )
}

type SelectItemProps<T extends ValidComponent = "li"> =
  SelectPrimitive.SelectItemProps<T> & { class?: string | undefined }

const SelectItem = <T extends ValidComponent = "li">(
  props: PolymorphicProps<T, SelectItemProps<T>>
) => {
  const [local, others] = splitProps(props as SelectItemProps, ["class"])
  return (
    <SelectPrimitive.Item
      class={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        local.class
      )}
      {...others}
    />
  )
}

const SelectItemIndicator: Component<SelectPrimitive.SelectItemIndicatorProps> = (props) => {
  return (
    <SelectPrimitive.ItemIndicator
      class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"
      {...props}
    >
      <CheckIcon class="h-4 w-4" />
    </SelectPrimitive.ItemIndicator>
  )
}

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectIcon,
  SelectContent,
  SelectListbox,
  SelectItem,
  SelectItemIndicator,
}
