// Adapted to a classic script from hydra-synth/hydra, src/lib/p5-wrapper.js.
// Hydra contributors, AGPL-3.0. See README.md for the pinned source.
window.P5 = class P5 extends window.p5 {
  constructor({ width = window.innerWidth, height = window.innerHeight, mode = 'P2D' } = {}) {
    super((p) => {
      p.setup = () => p.createCanvas(width, height, p[mode])
      p.draw = () => {}
    }, 'hydra-ui')
    this.mode = mode
    Object.assign(this.canvas.style, { position: 'absolute', top: '0', left: '0', zIndex: '-1' })
  }
  show() {
    this.canvas.style.visibility = 'visible'
  }
  hide() {
    this.canvas.style.visibility = 'hidden'
  }
  clear() {
    this.drawingContext.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
