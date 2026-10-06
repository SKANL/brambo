import { describe, expect, it } from 'vitest'
import config from '../vitest.config.ts'

describe('workflow-remote Vitest configuration', () => {
  it('limits discovery to tests owned by this package', () => {
    expect((config.test as { include?: readonly string[] }).include).toEqual(['test/**/*.test.ts'])
  })
})
