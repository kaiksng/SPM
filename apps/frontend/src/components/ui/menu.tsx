import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

function MenuTrigger({
  className,
  ...props
}: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function MenuContent({
  className,
  children,
  sideOffset = 4,
  align = "end",
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "sideOffset" | "align">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        className="outline-none"
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "bg-popover text-popover-foreground min-w-48 rounded-lg border p-1 shadow-lg",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="menu-separator"
      role="separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export { Menu, MenuTrigger, MenuContent, MenuSeparator };
