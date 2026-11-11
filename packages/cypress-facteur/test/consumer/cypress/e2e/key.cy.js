// The browser never holds the key. The test gathers everything it can see (the window of the spec and of the runner, the
// storages, the cookies, the exposed variables, the config, `cy.env`) and gives it to Node, which holds the key and says
// whether it is in there. A decoy planted in the window shows that the scan does reach the window.
const strings = (target) => {
    const found = []
    let names = []
    try {
        names = Object.getOwnPropertyNames(target)
    } catch {
        return found
    }
    for (const name of names) {
        try {
            const value = target[name]
            if (typeof value === 'string') found.push(value)
            else if (value && typeof value === 'object') found.push(JSON.stringify(value))
        } catch {
            // A property that throws or loops is not data; skip it.
        }
    }
    return found
}

describe('the key', () => {
    it('is nowhere in the browser', () => {
        const decoy = `decoy-${Date.now()}`
        window.__facteurDecoy = decoy
        const storage = (area) => Object.keys(area).map((name) => `${name}=${area.getItem(name)}`)
        const seen = {
            window: strings(window).join('\n'),
            runnerWindow: strings(window.top).join('\n'),
            localStorage: storage(window.localStorage).join('\n'),
            sessionStorage: storage(window.sessionStorage).join('\n'),
            cookie: document.cookie,
            html: document.documentElement.outerHTML,
            expose: JSON.stringify(Cypress.expose()),
            config: JSON.stringify(Cypress.config()),
        }
        cy.facteurAddress().then((address) => {
            seen.address = address
        })
        cy.env(['FACTEUR_API_KEY']).then((env) => {
            seen.env = JSON.stringify(env)
        })
        cy.then(() => cy.task('probe', { seen, decoy })).then((result) => {
            expect(result.decoyIn, 'the scan reaches the window').to.include('window')
            expect(result.keyIn, 'where the key was found in the browser').to.deep.eq([])
        })
    })
})
