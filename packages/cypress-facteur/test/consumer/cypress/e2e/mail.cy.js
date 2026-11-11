// Three tests of one describe, each sending its own mail and reading it back at once. The wait starts while the mail is
// still being ingested: if the three tests shared an address, the second and the third would be answered by the mail the
// first one left in the inbox, and the subject they read would not be their own.
describe('tests of one describe', () => {
    for (const [index, code] of [['first', '111111'], ['second', '222222'], ['third', '333333']]) {
        it(`reads the mail of the ${index} test`, () => {
            cy.facteurAddress('qa').then((to) => {
                cy.task('sendMail', { to, subject: `mail of the ${index} test`, text: `Your code is ${code}.` })
            })
            cy.facteurWaitFor({ timeout: 60_000 }).then((message) => {
                expect(message.subject).to.eq(`mail of the ${index} test`)
                expect(message.otp).to.eq(code)
            })
        })
    }

    it('gives the same address twice in a test, and another one to the next test', () => {
        cy.facteurAddress().then((first) => {
            cy.facteurAddress().should('eq', first)
            cy.wrap(first).as('address')
        })
        cy.get('@address').then((address) => expect(address).to.match(/^test\+gives-the-same-address-[a-z0-9-]+@/))
    })
})

describe('a mail that never comes', () => {
    let failed = false

    it('fails with what did arrive', () => {
        cy.on('fail', (error) => {
            failed = true
            expect(error.message).to.contain('No message matched {"subject":"Your invoice"} at ...+')
            expect(error.message).to.contain('What did arrive: ')
            expect(error.message.match(/What did arrive/g)).to.have.length(1)
            return false
        })
        cy.facteurWaitFor({ subject: 'Your invoice', timeout: 3_000 })
    })

    // The handler above returns false, so a wait that wrongly succeeded would pass the test above without running it.
    it('did go through the failure handler', () => {
        expect(failed, 'cy.facteurWaitFor failed and the handler ran').to.eq(true)
    })
})
