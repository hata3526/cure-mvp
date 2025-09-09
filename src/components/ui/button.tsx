import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsx } from "clsx";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "secondary" | "destructive" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
}

const variantToClass: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-primary text-primary-foreground hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  secondary:
    "bg-secondary text-secondary-foreground hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  destructive:
    "bg-destructive text-destructive-foreground hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  ghost:
    "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
};

const sizeToClass: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6",
  icon: "h-10 w-10",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild, variant = "default", size = "md", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as any}
        className={clsx(
          "inline-flex items-center justify-center rounded-2xl whitespace-nowrap transition-colors gap-2",
          variantToClass[variant],
          sizeToClass[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
