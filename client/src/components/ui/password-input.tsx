import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password field with a show/hide toggle. Drop-in for a bare
// <input type="password" />: pass the same className / style / value / onChange
// and it keeps whatever look the surrounding form uses. The toggle only changes
// the input's own type — the value is never logged or sent anywhere.
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  "data-testid"?: string;
  /** data-testid for the toggle button; defaults to `${data-testid}-toggle`. */
  toggleTestId?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, style, toggleTestId, "data-testid": testId, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={className}
          style={{ ...style, paddingRight: 40 }}
          data-testid={testId}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-vf-muted hover:text-vf-text transition-colors"
          data-testid={toggleTestId ?? (testId ? `${testId}-toggle` : "button-toggle-password")}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
