import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(async () => undefined),
    get: vi.fn(),
    waitFor: vi.fn(),
    options: [] as unknown[],
}))

vi.mock('@facteur-eu/sdk', async (original) => {
    const real = await original<typeof import('@facteur-eu/sdk')>()
    class Facteur {
        inboxes = { list: sdk.list, create: sdk.create, delete: sdk.remove, messages: vi.fn() }
        messages = { waitFor: sdk.waitFor, get: sdk.get }
        constructor(options: unknown) {
            sdk.options.push(options)
        }
    }
    return { ...real, Facteur }
})

import { FacteurTimeout } from '@facteur-eu/sdk'
import { facteurTasks, TASKS } from './plugin.js'

type Task = (arg?: unknown) => Promise<unknown>

function register(env: Record<string, string> = {}) {
    let tasks: Record<string, Task> = {}
    const config = { env: { ...env } } as unknown as Cypress.PluginConfigOptions
    const returned = facteurTasks(((_: string, handlers: Record<string, Task>) => (tasks = handlers)) as never, config)
    return { tasks, returned: returned as { env: Record<string, unknown>; expose: Record<string, unknown> } }
}

beforeEach(() => {
    vi.clearAllMocks()
    sdk.options.length = 0
    delete process.env.FACTEUR_API_KEY
    delete process.env.FACTEUR_INBOX
})

describe('facteurTasks', () => {
    it('removes the key from the config that goes to the browser, and keeps it in Node', async () => {
        sdk.list.mockResolvedValue([{ id: 'abcd1234', domain: 'abcd1234.inbox.example.test' }])
        const { tasks, returned } = register({ FACTEUR_API_KEY: 'fk_secret', FACTEUR_INBOX: 'abcd1234' })

        expect(JSON.stringify(returned)).not.toContain('fk_secret')
        await tasks[TASKS.inbox]?.()
        expect(sdk.options[0]).toMatchObject({ apiKey: 'fk_secret' })
    })

    it('exposes a run id to the browser, never the key', async () => {
        sdk.list.mockResolvedValue([{ id: 'abcd1234', domain: 'abcd1234.inbox.example.test' }])
        const { tasks, returned } = register({ FACTEUR_API_KEY: 'fk_secret', FACTEUR_INBOX: 'abcd1234' })

        expect(returned.expose.FACTEUR_RUN).toEqual(expect.any(String))
        expect(JSON.stringify(returned.expose)).not.toContain('fk_secret')
        expect(await tasks[TASKS.inbox]?.()).toEqual({ id: 'abcd1234', domain: 'abcd1234.inbox.example.test' })
    })

    it('opens nothing at setup: the inbox is opened by the first task that needs it, once', async () => {
        sdk.create.mockResolvedValue({ id: 'new00001', domain: 'new00001.inbox.example.test' })
        const { tasks } = register({ FACTEUR_API_KEY: 'fk_secret' })
        expect(sdk.create).not.toHaveBeenCalled()

        await tasks[TASKS.inbox]?.()
        await tasks[TASKS.inbox]?.()
        expect(sdk.create).toHaveBeenCalledTimes(1)
    })

    it('says so when FACTEUR_INBOX names an inbox the key does not reach', async () => {
        sdk.list.mockResolvedValue([])
        const { tasks } = register({ FACTEUR_API_KEY: 'fk_secret', FACTEUR_INBOX: 'zzzz9999' })
        await expect(tasks[TASKS.inbox]?.()).rejects.toThrow(/zzzz9999.*does not reach/)
    })

    it('waits on this test address only, with the plus sign that stops one tag from matching another', async () => {
        sdk.list.mockResolvedValue([{ id: 'abcd1234', domain: 'd' }])
        sdk.waitFor.mockResolvedValue({ id: 'm1', subject: 'Hello', textBody: 'Your code is 482913' })
        const { tasks } = register({ FACTEUR_API_KEY: 'k', FACTEUR_INBOX: 'abcd1234' })

        const answer = await tasks[TASKS.waitFor]?.({ tag: 'my-tag', criteria: { subject: 'Hello' }, timeout: 5000 })
        // The message of the search carries its bodies: the task does not read it a second time.
        expect(answer).toEqual({ message: { id: 'm1', subject: 'Hello', textBody: 'Your code is 482913' } })
        expect(sdk.get).not.toHaveBeenCalled()
        expect(sdk.waitFor).toHaveBeenCalledWith({ inbox: 'abcd1234', sentTo: '+my-tag@', subject: 'Hello', wait: 5000 })
    })

    it('turns a timeout into a value, with what did arrive, instead of a rejected task', async () => {
        sdk.list.mockResolvedValue([{ id: 'abcd1234', domain: 'd' }])
        sdk.waitFor.mockRejectedValue(new FacteurTimeout('No message matched.', { criteria: {}, waitedMs: 1000, arrived: [{ id: 'x', subject: 'Other', toAddress: 'a@d', status: 'parsed' }] as never }))
        const { tasks } = register({ FACTEUR_API_KEY: 'k', FACTEUR_INBOX: 'abcd1234' })

        const answer = (await tasks[TASKS.waitFor]?.({ tag: 't', criteria: {} })) as { timedOut: { criteria: object; waitedMs: number; address: string; arrived: unknown[] } }
        expect(answer.timedOut).toMatchObject({ criteria: {}, waitedMs: 1000, address: '...+t@d' })
        expect(answer.timedOut.arrived).toHaveLength(1)
    })

    it('deletes the inbox it opened, and keeps one it was given', async () => {
        sdk.create.mockResolvedValue({ id: 'new00001', domain: 'd' })
        const opened = register({ FACTEUR_API_KEY: 'k' })
        await opened.tasks[TASKS.inbox]?.()
        await opened.tasks[TASKS.purge]?.()
        expect(sdk.remove).toHaveBeenCalledWith('new00001')

        sdk.remove.mockClear()
        sdk.list.mockResolvedValue([{ id: 'abcd1234', domain: 'd' }])
        const named = register({ FACTEUR_API_KEY: 'k', FACTEUR_INBOX: 'abcd1234' })
        await named.tasks[TASKS.inbox]?.()
        await named.tasks[TASKS.purge]?.()
        expect(sdk.remove).not.toHaveBeenCalled()
    })
})
