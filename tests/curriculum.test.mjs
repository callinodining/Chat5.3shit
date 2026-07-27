import assert from 'node:assert/strict';
import { MISSION_DEFS, LANGUAGES, validateCurriculum } from '../src/data.js';

assert.equal(MISSION_DEFS.length, 18, 'Die Kampagne benötigt genau 18 Missionen.');
assert.equal(LANGUAGES.filter((language) => language.available).length, 1);
assert.equal(LANGUAGES.find((language) => language.available).id, 'de-DE');
assert.deepEqual(validateCurriculum(), []);

for (let index = 1; index < MISSION_DEFS.length; index += 1) {
  const previous = new Set(MISSION_DEFS[index - 1].allowed);
  for (const char of previous) {
    assert(MISSION_DEFS[index].allowed.includes(char), `Mission ${index + 1} verliert "${char}".`);
  }
}

console.log('Curriculum: 18 Missionen und alle Zeichensätze sind gültig.');
