import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerFacteurCommands } from './index.js'
import { TASKS } from './tasks.js'

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('registerFacteurCommands', () => {
    it('registers the five commands', () => {
        const add = vi.fn()
        vi.stubGlobal('Cypress', { Commands: { add } })

        registerFacteurCommands()

        expect(add.mock.calls.map((call) => call[0]).sort()).toEqual(['facteurAddress', 'facteurInbox', 'facteurMessages', 'facteurPurge', 'facteurWaitFor'])
    })

    it('answers cy.facteurInbox() with the inbox task, quietly', () => {
        const add = vi.fn()
        const task = vi.fn(() => 'chain')
        vi.stubGlobal('Cypress', { Commands: { add } })
        vi.stubGlobal('cy', { task })

        registerFacteurCommands()
        const command = add.mock.calls.find((call) => call[0] === 'facteurInbox')?.[1] as () => unknown

        expect(command()).toBe('chain')
        expect(task).toHaveBeenCalledWith(TASKS.inbox, null, { log: false })
    })
})
