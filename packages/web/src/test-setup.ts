import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// @dnd-kit uses ResizeObserver at module load time; jsdom doesn't provide it
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver

afterEach(() => {
  cleanup()
})
