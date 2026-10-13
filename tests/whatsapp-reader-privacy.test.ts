import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayChatName,
  displayWhatsAppSender,
  isWhatsAppIdentifier,
  maskWhatsAppId,
} from '../src/server/whatsapp-reader.ts';

test('erkennt LID-, Nummern- und Telefonkennungen', () => {
  assert.equal(isWhatsAppIdentifier('138237850968149@lid'), true);
  assert.equal(isWhatsAppIdentifier('227521782116596:20@lid'), true);
  assert.equal(isWhatsAppIdentifier('4917612345678@c.us'), true);
  assert.equal(isWhatsAppIdentifier('+49 176 1234567'), true);
  assert.equal(isWhatsAppIdentifier('Komtur Mario'), false);
});

test('ersetzt Absender-Kennungen durch neutralen Platzhalter', () => {
  assert.equal(displayWhatsAppSender('138237850968149@lid'), 'Teilnehmer');
  assert.equal(displayWhatsAppSender(undefined), 'Teilnehmer');
  assert.equal(displayWhatsAppSender('Hardy'), 'Hardy');
});

test('maskiert Chat-IDs stabil und nicht rückrechenbar', () => {
  const masked = maskWhatsAppId('4917612345678@c.us');
  assert.equal(masked, maskWhatsAppId('4917612345678@c.us'));
  assert.doesNotMatch(masked, /4917612345678/);
  assert.match(masked, /^wa-[0-9a-f]{10}$/);
});

test('Chat-Name mit Kennung wird maskiert, Klartextnamen bleiben', () => {
  assert.match(displayChatName('4917612345678@c.us'), /^Chat wa-[0-9a-f]{10}$/);
  assert.equal(displayChatName('Berliner Rittergilde'), 'Berliner Rittergilde');
});
