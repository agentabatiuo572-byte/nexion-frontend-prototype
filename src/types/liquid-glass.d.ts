// TS 4.9 uses classic node resolution; the package exposes this subpath via exports.
declare module "simple-liquid-glass/webgl" {
  export type WebGLSurface = { update(options: WebGLSurfaceOptions): void; refresh(): Promise<void>; destroy(): void };
  export type WebGLSurfaceOptions = { map: string; scale: number; dispersion: number; specular: number; classic: boolean; neutralPoint?: number; radius: number; blur: number; saturation: number };
  export function createWebGLSurface(element: HTMLElement, output: HTMLElement, backdrop: HTMLElement, options: WebGLSurfaceOptions, onStatus?: (status: string) => void): WebGLSurface;
}
