import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-white/10 text-text-secondary border-white/10",
  success:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning:
    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger:
    "bg-red-500/10 text-red-400 border-red-500/20",
  info:
    "bg-sky-500/10 text-sky-400 border-sky-500/20",
  outline:
    "bg-transparent text-text-secondary border-white/20",
};

const sizeStyles = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export function Badge({
  variant = "default",
  size = "sm",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 font-medium border rounded-full
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </span>
  );
}

// Helper for status badges
const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
  draft: { variant: "default", label: "Draft" },
  submitted: { variant: "info", label: "Submitted" },
  pending_review: { variant: "warning", label: "Pending Review" },
  approved: { variant: "success", label: "Approved" },
  partially_approved: { variant: "success", label: "Partially Approved" },
  denied: { variant: "danger", label: "Denied" },
  appealed: { variant: "warning", label: "Appealed" },
  expired: { variant: "default", label: "Expired" },
  cancelled: { variant: "default", label: "Cancelled" },
};

export function StatusBadge({ status, ...props }: { status: string } & HTMLAttributes<HTMLSpanElement>) {
  const config = statusConfig[status] || { variant: "default" as BadgeVariant, label: status };
  return <Badge variant={config.variant} {...props}>{config.label}</Badge>;
}
