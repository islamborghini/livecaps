import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-dark",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // LiveCaps custom variants
        gradient:
          "bg-gradient-to-r from-[#0D9488] to-[#14B8A6] text-white font-medium hover:from-[#0F766E] hover:to-[#0D9488] transition-all duration-300 shadow-lg shadow-[#0D9488]/25 hover:shadow-xl hover:shadow-[#0D9488]/30",
        "gradient-lg":
          "bg-gradient-to-r from-[#0D9488] to-[#14B8A6] text-white font-semibold hover:from-[#0F766E] hover:to-[#0D9488] transition-all duration-300 shadow-lg shadow-[#0D9488]/25 hover:shadow-2xl hover:shadow-[#0D9488]/40 hover:scale-105",
        "nav-cta":
          "relative bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300",
        "ghost-dark":
          "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 px-8 rounded-xl text-base",
        xl: "h-14 px-10 rounded-xl text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
