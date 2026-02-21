import type { CSSProperties, FC, ReactNode } from "react";

export interface LogoLoopProps {
  logos: { src: string; alt: string }[];
  width?: string;
  logoHeight?: number;
  gap?: number;
  speed?: number;
  direction?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  className?: string;
  pauseOnHover?: boolean;
  hoverSpeed?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
  scaleOnHover?: boolean;
  renderItem?: (item: { src: string; alt: string }) => ReactNode;
}

declare const LogoLoop: FC<LogoLoopProps>;
export default LogoLoop;
