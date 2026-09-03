type NavigationIconName =
  | "dashboard"
  | "conversations"
  | "opportunities"
  | "contents"
  | "projects"
  | "topics"
  | "clone"
  | "settings"
  | "collapse"
  | "expand"
  | "more";

type NavigationIconProps = {
  name: NavigationIconName;
  size?: number;
  className?: string;
};

const NavigationIcon = ({ name, size = 18, className }: NavigationIconProps) => {
  const drawing = (() => {
    switch (name) {
      case "dashboard":
        return (
          <>
            <rect x="2.5" y="2.5" width="5" height="5" />
            <rect x="10.5" y="2.5" width="5" height="5" />
            <rect x="2.5" y="10.5" width="5" height="5" />
            <rect x="10.5" y="10.5" width="5" height="5" />
          </>
        );
      case "conversations":
        return (
          <>
            <path d="M2.5 3.5h13v8h-7l-3.5 3v-3H2.5z" />
            <path d="M5.5 7h7" />
          </>
        );
      case "opportunities":
        return (
          <>
            <rect x="2.5" y="5.5" width="13" height="9" />
            <path d="M6.5 5.5v-2h5v2M2.5 9.5h13" />
          </>
        );
      case "contents":
        return (
          <>
            <path d="M4.5 2.5h6l3 3v10h-9z" />
            <path d="M6.5 8.5h5M6.5 11.5h5" />
          </>
        );
      case "projects":
        return (
          <>
            <circle cx="4.5" cy="4.5" r="2" />
            <circle cx="4.5" cy="13.5" r="2" />
            <circle cx="13.5" cy="9" r="2" />
            <path d="M4.5 6.5v5M6.5 4.5c4 0 4 4.5 5 4.5M6.5 13.5c4 0 4-4.5 5-4.5" />
          </>
        );
      case "topics":
        return (
          <>
            <path d="M2.5 2.5h7l6 6-6 6-7-7z" />
            <circle cx="6" cy="6" r="1" />
          </>
        );
      case "clone":
        return (
          <>
            <circle cx="9" cy="6" r="3" />
            <path d="M3.5 15.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          </>
        );
      case "settings":
        return (
          <>
            <path d="M2.5 5.5h13M2.5 12.5h13" />
            <circle cx="7" cy="5.5" r="1.8" fill="var(--navigation-icon-surface, var(--app-canvas))" />
            <circle cx="11.5" cy="12.5" r="1.8" fill="var(--navigation-icon-surface, var(--app-canvas))" />
          </>
        );
      case "collapse":
      case "expand":
        return (
          <g transform={name === "expand" ? "translate(18 0) scale(-1 1)" : undefined}>
            <rect x="2.5" y="3.5" width="13" height="11" />
            <path d="M6.5 3.5v11M12 7l-2 2 2 2" />
          </g>
        );
      case "more":
        return (
          <>
            <circle cx="4" cy="9" r="1" fill="currentColor" stroke="none" />
            <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
            <circle cx="14" cy="9" r="1" fill="currentColor" stroke="none" />
          </>
        );
    }
  })();

  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawing}
    </svg>
  );
};

export { NavigationIcon };
export type { NavigationIconName };
