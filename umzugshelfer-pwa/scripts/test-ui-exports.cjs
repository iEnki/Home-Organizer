const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToBuffer } = require('@react-pdf/renderer');
const app = path.resolve(__dirname, '..');
const originalLoader = require.extensions['.js'];
// Compile only existing app JSX for this Node integration check, never node_modules.
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(path.join(app, 'src') + path.sep)) return originalLoader(module, filename);
  const { code } = require('@babel/core').transformFileSync(filename, { configFile: path.join(app, 'babel.config.cjs') });
  module._compile(code, filename);
};

(async () => {
  const Packliste = require('../src/components/PacklistePDF').default;
  const Tagebuch = require('../src/components/TagebuchPDF').default;
  const Kfz = require('../src/components/home/kfz/KfzReportPDF').default;
  const documents = {
    packing: React.createElement(Packliste, { kisten: [{ id: 'generated-box', name: 'Generated Box', raum_neu: 'Kitchen', qr_code_wert: 'generated-box/123', inhalt: [{ id: 'generated-item', beschreibung: 'Generated Plates', menge: 12, kategorie: 'Kitchenware' }] }] }),
    diary: React.createElement(Tagebuch, { generierterTagebuchText: 'Generated diary heading\n\nGenerated diary text with **important** contents.', umzugsdatenJSON: { events: [], phasen: ['Generated phase'] }, signedImageUrlsMap: {} }),
    vehicle: React.createElement(Kfz, { vehicle: { name: 'Generated Car', kennzeichen: 'TEST-123' }, periodLabel: 'Generated period', stats: { totalCost: 1234.56, costPerKm: 0.2, totalDistance: 1000, mileageCoverageStart: '2026-01-01', mileageCoverageEnd: '2026-11-01', averageConsumption: 6.7, transactions: [{ id: 'generated-cost', date: '2026-11-01', category: 'Service', description: 'Generated service', amount: 1234.56 }] }, services: [{ id: 'generated-service', datum: '2026-11-01', typ: 'Service', kosten: 1234.56, beschreibung: 'Generated inspection' }], servicePositions: [{ service_id: 'generated-service', beschreibung: 'Generated brake pads' }], tires: [] }),
  };
  const results = [];
  for (const [name, document] of Object.entries(documents)) {
    const buffer = await renderToBuffer(document);
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-'); assert.ok(buffer.length > 1000);
    if (process.env.UI_PDF_OUTPUT) { fs.mkdirSync(process.env.UI_PDF_OUTPUT, { recursive: true }); fs.writeFileSync(path.join(process.env.UI_PDF_OUTPUT, name + '.pdf'), buffer); }
    results.push({ name, bytes: buffer.length });
  }
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
