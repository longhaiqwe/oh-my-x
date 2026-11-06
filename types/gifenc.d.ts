declare module 'gifenc' {
  export function quantize(rgba: Uint8ClampedArray, colors: number, options?: { format: 'rgb444' }): number[][]
  export function applyPalette(rgba: Uint8ClampedArray, palette: number[][], format?: 'rgb444'): Uint8Array
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, options: { palette: number[][]; delay: number; repeat: number }): void
    finish(): void
    bytes(): Uint8Array<ArrayBuffer>
    bytesView(): Uint8Array<ArrayBuffer>
  }
}
