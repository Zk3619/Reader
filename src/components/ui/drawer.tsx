import type { Component, ComponentProps, JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import type {
  ContentProps,
  DescriptionProps,
  DynamicProps,
  LabelProps,
  OverlayProps
} from "@corvu/drawer"
import DrawerPrimitive from "@corvu/drawer"

import { cn } from "@/lib/utils"

const Drawer = DrawerPrimitive

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

type DrawerOverlayProps<T extends ValidComponent = "div"> = OverlayProps<T> & { class?: string }

const DrawerOverlay = <T extends ValidComponent = "div">(
  props: DynamicProps<T, DrawerOverlayProps<T>>
) => {
  const [, rest] = splitProps(props as DrawerOverlayProps, ["class"])
  const drawerContext = DrawerPrimitive.useContext()
  return (
    <DrawerPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 data-transitioning:transition-colors data-transitioning:duration-300",
        props.class
      )}
      style={{
        "background-color": `rgb(0 0 0 / ${0.8 * drawerContext.openPercentage()})`
      }}
      {...rest}
    />
  )
}

type DrawerContentProps<T extends ValidComponent = "div"> = ContentProps<T> & {
  class?: string
  children?: JSX.Element
  /** 覆盖层 class，用于与内容区统一 z-index（如阅读器内段评需盖过 z-100） */
  overlayClass?: string
}

const DrawerContent = <T extends ValidComponent = "div">(
  props: DynamicProps<T, DrawerContentProps<T>>
) => {
  const ctx = DrawerPrimitive.useContext()
  const [, rest] = splitProps(props as DrawerContentProps, ["class", "children", "overlayClass"])
  const side = () => ctx.side()
  return (
    <DrawerPortal>
      <DrawerOverlay class={props.overlayClass} />
      <DrawerPrimitive.Content
        class={cn(
          "fixed z-50 flex flex-col border bg-background data-transitioning:transition-transform data-transitioning:duration-300 md:select-none",
          side() === "left" &&
            "left-0 top-0 bottom-0 h-full w-full max-w-sm rounded-r-[10px] border-l",
          side() === "right" &&
            "right-0 top-0 bottom-0 h-full w-full max-w-sm rounded-l-[10px] border-r",
          (side() === "bottom" || side() === "top") &&
            "inset-x-0 bottom-0 mt-24 flex h-auto flex-col rounded-t-[10px] after:absolute after:inset-x-0 after:top-full after:h-1/2 after:bg-inherit",
          props.class
        )}
        {...rest}
      >
        {side() === "left" && (
          <div class="absolute right-0 top-1/2 z-10 h-24 w-2 -translate-y-1/2 rounded-l bg-muted" />
        )}
        {side() === "right" && (
          <div class="absolute left-0 top-1/2 z-10 h-24 w-2 -translate-y-1/2 rounded-r bg-muted" />
        )}
        {(side() === "bottom" || side() === "top") && (
          <div class="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
        )}
        {props.children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

const DrawerHeader: Component<ComponentProps<"div">> = (props) => {
  const [, rest] = splitProps(props, ["class"])
  return <div class={cn("grid gap-1.5 p-4 text-center sm:text-left", props.class)} {...rest} />
}

const DrawerFooter: Component<ComponentProps<"div">> = (props) => {
  const [, rest] = splitProps(props, ["class"])
  return <div class={cn("t-auto flex flex-col gap-2 p-4", props.class)} {...rest} />
}

type DrawerTitleProps<T extends ValidComponent = "div"> = LabelProps<T> & { class?: string }

const DrawerTitle = <T extends ValidComponent = "div">(
  props: DynamicProps<T, DrawerTitleProps<T>>
) => {
  const [, rest] = splitProps(props as DrawerTitleProps, ["class"])
  return (
    <DrawerPrimitive.Label
      class={cn("text-lg font-semibold leading-none tracking-tight", props.class)}
      {...rest}
    />
  )
}

type DrawerDescriptionProps<T extends ValidComponent = "div"> = DescriptionProps<T> & {
  class?: string
}

const DrawerDescription = <T extends ValidComponent = "div">(
  props: DynamicProps<T, DrawerDescriptionProps<T>>
) => {
  const [, rest] = splitProps(props as DrawerDescriptionProps, ["class"])
  return (
    <DrawerPrimitive.Description
      class={cn("text-sm text-muted-foreground", props.class)}
      {...rest}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription
}
