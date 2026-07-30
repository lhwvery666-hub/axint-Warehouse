import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface WorkOrderCardStackProps {
  children: ReactNode
  className?: string
  desktopColumns?: 1 | 2
}

export function WorkOrderCardStack({
  children,
  className,
  desktopColumns = 1,
}: WorkOrderCardStackProps) {
  return (
    <div
      className={cn(
        "work-order-card-stack isolate pb-6 [perspective:1200px]",
        desktopColumns === 2
          ? "grid grid-cols-1 xl:grid-cols-2 xl:gap-x-4 [&>*+*]:-mt-3 sm:[&>*+*]:-mt-4 xl:[&>*+*]:mt-0 xl:[&>*:nth-child(n+3)]:-mt-4"
          : "flex flex-col [&>*+*]:-mt-3 sm:[&>*+*]:-mt-4",
        "[&>*]:relative [&>*]:overflow-visible [&>*]:rounded-2xl",
        "[&>*]:border [&>*]:border-border/70 [&>*]:bg-card/90 [&>*]:backdrop-blur-xl",
        "[&>*]:[backface-visibility:hidden] [&>*]:[content-visibility:auto] [&>*]:[contain-intrinsic-size:auto_116px]",
        "[&>*]:shadow-[0_14px_32px_-22px_rgba(15,23,42,0.55)]",
        "[&>*]:transition-[transform,box-shadow,border-color,background-color] [&>*]:duration-300 [&>*]:ease-out",
        "[&>*:hover]:z-10 [&>*:hover]:-translate-y-1.5 [&>*:hover]:scale-[1.006] [&>*:hover]:border-primary/45 [&>*:hover]:bg-card",
        "[&>*:hover]:shadow-[0_24px_48px_-22px_rgba(37,99,235,0.42)]",
        "[&>*:active]:translate-y-0 [&>*:active]:scale-[0.997]",
        "[&>*:focus-within]:z-10 [&>*:focus-within]:-translate-y-1.5 [&>*:focus-within]:scale-[1.006] [&>*:focus-within]:border-primary/45",
        "motion-reduce:[&>*]:transform-none motion-reduce:[&>*]:transition-none",
        "dark:[&>*]:border-white/10 dark:[&>*]:bg-card/85",
        className,
      )}
    >
      {children}
    </div>
  )
}
