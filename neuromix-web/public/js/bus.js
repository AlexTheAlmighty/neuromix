// Tiny event bus so views can hand work to each other without importing each other.
const target = new EventTarget()

export const emit = (type, detail) => target.dispatchEvent(new CustomEvent(type, { detail }))
export const on = (type, handler) => target.addEventListener(type, (e) => handler(e.detail))
