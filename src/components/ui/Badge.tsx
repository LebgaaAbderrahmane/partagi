import { type ReactNode } from "react";

export type BadgeVariant = "default" | "success" | "accent" | "danger";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  default: "",
  success: "badge-success",
  accent: "badge-accent",
  danger: "badge-danger",
};

export default function Badge({
  variant = "default",
  children,
}: BadgeProps) {
  return (
    <span className={`badge ${variantClass[variant]}`.trim()}>
      {children}
    </span>
  );
}
