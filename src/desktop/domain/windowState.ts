export interface DesktopWindowBounds {
  height: number;
  width: number;
  x?: number;
  y?: number;
}

export const DESKTOP_WINDOW_CONFIG = {
  backgroundColor: "#f6fbfe",
  defaultHeight: 860,
  defaultWidth: 1280,
  maxHeight: 2400,
  maxWidth: 3200,
  minHeight: 700,
  minWidth: 1040
} as const;

export interface DesktopWindowChromeOptions {
  titleBarStyle?: "hiddenInset";
  trafficLightPosition?: {
    x: number;
    y: number;
  };
}

export function getDesktopWindowChromeOptions(platform: NodeJS.Platform): DesktopWindowChromeOptions {
  if (platform !== "darwin") {
    return {};
  }

  return {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: {
      x: 18,
      y: 14
    }
  };
}

export function getInitialWindowBounds(savedBounds: DesktopWindowBounds | null | undefined): DesktopWindowBounds {
  return sanitizeWindowBounds(savedBounds) ?? {
    height: DESKTOP_WINDOW_CONFIG.defaultHeight,
    width: DESKTOP_WINDOW_CONFIG.defaultWidth
  };
}

export function sanitizeWindowBounds(value: unknown): DesktopWindowBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  const width = sanitizeDimension(value.width, DESKTOP_WINDOW_CONFIG.minWidth, DESKTOP_WINDOW_CONFIG.maxWidth);
  const height = sanitizeDimension(value.height, DESKTOP_WINDOW_CONFIG.minHeight, DESKTOP_WINDOW_CONFIG.maxHeight);

  if (width === null || height === null) {
    return null;
  }

  const bounds: DesktopWindowBounds = { height, width };
  const x = sanitizeCoordinate(value.x);
  const y = sanitizeCoordinate(value.y);

  if (x !== null) {
    bounds.x = x;
  }
  if (y !== null) {
    bounds.y = y;
  }

  return bounds;
}

export function toPersistedWindowBounds(value: DesktopWindowBounds): DesktopWindowBounds {
  return sanitizeWindowBounds(value) ?? {
    height: DESKTOP_WINDOW_CONFIG.defaultHeight,
    width: DESKTOP_WINDOW_CONFIG.defaultWidth
  };
}

function sanitizeDimension(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(Math.min(max, Math.max(min, value)));
}

function sanitizeCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
