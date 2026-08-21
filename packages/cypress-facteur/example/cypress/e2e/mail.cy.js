/**
 * What a customer's suite looks like, minus the application.
 *
 * The mail is sent by a task here because there is no application in this example; in a
 * real suite that line is a click on a form. Everything else is the plugin.
 */
describe('receiving mail in Cypress', () => {
  after(() => {
    cy.facteurPurge();
  });

  it('waits for a message and reads the code that was extracted from it', () => {
    cy.facteurAddress('signup').then((address) => {
      cy.task('sendMail', {
        to: address,
        subject: 'Votre code de vérification',
        body: 'Votre code est 882314. Il expire dans dix minutes.',
      });

      cy.facteurWaitFor().should((message) => {
        expect(message.status).to.equal('parsed');
        expect(message.otp).to.equal('882314');
        expect(message.to).to.equal(address);
      });
    });
  });

  it('filters on a criterion, and the address keeps the tests apart', () => {
    cy.facteurAddress('invoice').then((address) => {
      cy.task('sendMail', {
        to: address,
        subject: 'Votre facture de janvier',
        body: 'Rendez-vous sur https://espace.exemple.fr/factures.',
      });

      cy.facteurWaitFor({ subject: 'facture' }).should((message) => {
        expect(message.to).to.equal(address);
        expect(message.links.map((link) => link.href).join(' ')).to.contain('espace.exemple.fr');
      });
    });
  });

  /**
   * A failing command is caught through `cy.on('fail')`, not through a rejected promise:
   * Cypress commands are queued, and `.then()` takes no error handler. Writing it the
   * other way is how this file first passed while proving nothing.
   */
  it('fails with what did arrive when nothing matches', (done) => {
    cy.on('fail', (error) => {
      expect(error.message).to.contain('No message matched');
      expect(error.message).to.contain('In that inbox');
      done();
      return false;
    });

    cy.facteurWaitFor({ subject: 'jamais-ce-sujet', wait: 2000 });
  });

  /**
   * The bug the example found on its first run: the tag used to live on Mocha's suite
   * context, which every test in a `describe` shares, so this test waited on the first
   * test's address and read the first test's mail.
   */
  it('gets an address of its own, not the one the first test used', () => {
    cy.facteurAddress().should((address) => {
      expect(address).to.contain('gets-an-address-of-its-own');
      expect(address).not.to.contain('waits-for-a-message');
    });
  });
});
