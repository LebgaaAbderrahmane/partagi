import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "primary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  default: "",
  primary: "btn-primary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

const sizeClass: Record<Size, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`btn ${variantClass[variant]} ${sizeClass[size]} ${className}`.trim()}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export default Button;
