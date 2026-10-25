import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gestureFrame} from '../public/organize-motion.js';
test('drag direction chooses its own animation, reverses to the idle frame, and cannot scrub beyond the release section',()=>{
 assert.deepEqual(gestureFrame(-100,250),{kind:'trash',frame:2});assert.deepEqual(gestureFrame(100,250),{kind:'keep',frame:2});assert.deepEqual(gestureFrame(0,250),{kind:'keep',frame:0});assert.deepEqual(gestureFrame(-1000,250),{kind:'trash',frame:4});assert.deepEqual(gestureFrame(1000,250),{kind:'keep',frame:6});
});
