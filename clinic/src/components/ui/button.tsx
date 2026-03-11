import { ButtonHTMLAttributes, forwardRef } from "react";

const variants = {
  default: "bg-emerald-500 hover:bg-emerald-600 text-white",
  destructive: "bg-red-600 hover:bg-red-700 text-white",
  outline: "border border-emerald-500 text-emerald-400 hover:bg-emerald-500/10",
  warning: "bg-yellow-600 hover:bg-yellow-700 text-white",
  ghost: "hover:bg-white/5 text-gray-300",
} as const;

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3 text-sm",
  lg: "h-12 px-6 text-lg",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
);
Button.displayName = "Button";
