import assert from 'node:assert/strict';
import React from 'react';
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer';

// Actual renderer integration, without personal data, network fonts or files.
const document = React.createElement(Document, null,
  React.createElement(Page, { size: 'A4' },
    React.createElement(Text, null, 'Dependency migration sample')));
const pdf = await renderToBuffer(document);
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
assert.ok(pdf.length > 500);
console.log(`PDF renderer integration passed (${pdf.length} bytes).`);
