// Text is a sibling of the output surface so recordings keep their original pixels.
class ProjectorCode {
  constructor(read) {
    this.read = read
    this.enabled = false
    this.buttons = new Set()
    this.outputs = new Set()
  }
  bind(button) {
    this.buttons.add(button)
    button.setAttribute('aria-pressed',String(this.enabled))
    const toggle = () => {
      this.enabled = !this.enabled
      for (const control of this.buttons) control.setAttribute('aria-pressed',String(this.enabled))
      this.refresh()
    }
    button.addEventListener('click',toggle)
    return () => { this.buttons.delete(button); button.removeEventListener('click',toggle) }
  }
  attach(host, allowed = () => true) {
    const view = host.ownerDocument.defaultView
    const output = {host,allowed}
    const resize = () => this.refresh(true)
    this.outputs.add(output)
    view.addEventListener('resize',resize)
    this.refresh()
    return () => {
      this.outputs.delete(output)
      output.pre?.remove()
      view.removeEventListener('resize',resize)
    }
  }
  refresh(resized = false) {
    let draft
    for (const output of this.outputs) {
      const visible = this.enabled && output.allowed()
      if (visible) draft ??= this.read()
      if (!visible || !draft?.text) {
        output.pre?.remove()
        output.pre = null
        continue
      }
      const {text,cursor} = draft, doc = output.host.ownerDocument
      if (!output.pre) {
        const pre = output.pre = doc.createElement('pre')
        pre.id = 'projectedCode'
        pre.setAttribute('aria-label','Código en proyección')
        pre.style.cssText = 'position:absolute;z-index:3;top:clamp(8px,3vh,42px);left:clamp(8px,3vw,56px);max-width:90%;width:max-content;max-height:58%;margin:0;padding:.2em .3em;overflow:hidden;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2;pointer-events:none;user-select:none;color:#fff;font:600 clamp(13px,1.6vw,36px)/1.36 ui-monospace,Consolas,monospace'
        const lines = pre.appendChild(doc.createElement('span'))
        lines.style.cssText='background:rgba(8,11,9,.84);box-decoration-break:clone;-webkit-box-decoration-break:clone'
        output.node = lines.appendChild(doc.createTextNode(''))
        output.host.append(pre)
        output.cursor = -1
      }
      const changed = output.node.data !== text
      if (changed) output.node.data = text
      if (!changed && !resized && output.cursor===cursor) continue
      output.cursor = cursor
      const caret = doc.createRange()
      caret.setStart(output.node,Math.min(cursor,text.length))
      caret.collapse(true)
      let line = caret.getBoundingClientRect()
      // Browsers report no caret box for a trailing newline in a text node.
      if (!line.height) {
        if (cursor===text.length) {
          output.pre.scrollTop=output.pre.scrollHeight
          continue
        }
        caret.setEnd(output.node,cursor+1)
        line=caret.getBoundingClientRect()
        if (!line.height) continue
      }
      const box = output.pre.getBoundingClientRect()
      if (line.top<box.top) output.pre.scrollTop += line.top-box.top-4
      else if (line.bottom>box.bottom) output.pre.scrollTop += line.bottom-box.bottom+4
    }
  }
}
