declare module 'hanzi-writer' {
  export interface HanziWriterOptions {
    width?: number
    height?: number
    padding?: number
    strokeColor?: string
    radicalColor?: string
    outlineColor?: string
    drawingColor?: string
    strokeAnimationSpeed?: number
    delayBetweenStrokes?: number
    delayBetweenLoops?: number
    showOutline?: boolean
    showCharacter?: boolean
    charDataLoader?: (
      char: string,
      onLoad: (data: unknown) => void,
      onError: (err: unknown) => void,
    ) => void
    onLoadCharDataSuccess?: (data: unknown) => void
    onLoadCharDataError?: (err: unknown) => void
  }

  export interface AnimateCharacterOptions {
    onComplete?: () => void
  }

  export default class HanziWriter {
    static create(
      element: string | HTMLElement | SVGElement,
      character: string,
      options?: HanziWriterOptions,
    ): HanziWriter

    animateCharacter(options?: AnimateCharacterOptions): Promise<void>
    loopCharacterAnimation(): void
    showCharacter(): Promise<void>
    hideCharacter(): Promise<void>
    showOutline(): Promise<void>
    hideOutline(): Promise<void>
    setCharacter(character: string): void
    updateColor(
      colorName: string,
      colorVal: string,
      options?: { duration?: number },
    ): Promise<void>
    updateDimensions(options: { width?: number; height?: number; padding?: number }): void
    cancelQuiz(): void
  }
}
