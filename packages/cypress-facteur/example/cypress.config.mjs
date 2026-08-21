/**
 * The example suite, and the proof.
 *
 * A plugin is an artefact of testing. What it claims is that Cypress's own machinery, the
 * command queue and `cy.task` and the retry, carries a message from a real SMTP port to a
 * real assertion. Simulating any of that proves the simulation, so this is a real Cypress
 * project, run in our own pipeline against a live API and a live ingester.
 *
 * It doubles as the copy-paste a reader wants: `setupNodeEvents` here is exactly the four
 * lines a customer writes, plus one task of its own for sending the mail that a real
 * application would send by itself.
 */
import { defineConfig } from 'cypress';
import net from 'node:net';
import { facteurTasks } from 'cypress-facteur/plugin';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? process.env.INGEST_PORT ?? 2525);

/** The mail a customer's application would send. Not part of the plugin. */
function sendMail({ to, subject, body }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: SMTP_PORT });
    const data = [
      'From: Expéditeur <no-reply@expediteur.test>',
      `To: <${to}>`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');
    const script = ['EHLO example', 'MAIL FROM:<no-reply@expediteur.test>', `RCPT TO:<${to}>`, 'DATA', `${data}\r\n.`, 'QUIT'];
    let step = -1;
    let buffer = '';
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error('SMTP timeout'));
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!/^\d{3} /.test(line)) continue;
        step += 1;
        if (step < script.length) socket.write(`${script[step]}\r\n`);
      }
    });
    socket.on('close', () => resolve(null));
    socket.on('error', reject);
  });
}

export default defineConfig({
  e2e: {
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    video: false,
    screenshotOnRunFailure: false,
    setupNodeEvents(on, config) {
      on('task', { sendMail });
      return facteurTasks(on, config);
    },
  },
});
