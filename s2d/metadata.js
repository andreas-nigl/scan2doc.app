(function (root) {
  'use strict';
  const safe = value => String(value || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_€.-]+/g, '_').replace(/_+/g, '_').replace(/^[_ .]+|[_ .]+$/g, '');
  const senderKey = value => safe(value).replace(/_/g, ' ');
  const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  function dateValue(day, month, year) {
    year = Number(year); if (year < 100) year += year > 70 ? 1900 : 2000;
    const date = new Date(year, Number(month) - 1, Number(day));
    if (date.getFullYear() !== year || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
    return localDate(date);
  }
  function extract(text, rules = {}) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const dates = [], amounts = [];
    lines.forEach((line, index) => {
      for (const m of line.matchAll(/\b(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4}|\d{2})\b/g)) {
        const value = dateValue(m[1], m[2], m[3]);
        if (value) dates.push({ value, score: /rechnungsdatum|belegdatum|ausgestellt|datum/i.test(line) ? 3 : /faellig|fällig|geburt|leistungszeitraum|zeitraum/i.test(line) ? -1 : index < 20 ? 1 : 0 });
      }
      for (const m of line.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
        const value = dateValue(m[3], m[2], m[1]); if (value) dates.push({ value, score: /datum/i.test(line) ? 3 : 0 });
      }
      const label = /gesamtbetrag|rechnungsbetrag|zahlbetrag|zu zahlen|endbetrag|gesamt\b|total\b|summe\b/i;
      if (label.test(line) || (index && label.test(lines[index - 1]))) {
        for (const m of line.matchAll(/(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)/g)) {
          const value = m[1].includes(',') ? Number(m[1].replace(/\./g, '').replace(',', '.')) : Number(m[1]);
          if (Number.isFinite(value)) amounts.push(value);
        }
      }
    });
    dates.sort((a, b) => b.score - a.score);
    const normalized = ` ${senderKey(text)} `;
    const matched = Object.keys(rules).filter(key => [key, ...(rules[key].aliases || [])].some(alias => {
      const name = senderKey(alias); return name.length >= 3 && normalized.includes(` ${name} `);
    }));
    let sender = matched.length === 1 ? matched[0] : '';
    if (!sender) {
      const organization = lines.slice(0, 12).find(line => /\b(gmbh|versicherung|versicherungs|aktiengesellschaft|ag|allianz|telekom|ing|diba)\b/i.test(line) && !/@|iban|www\./i.test(line));
      sender = organization || '';
    }
    const documentType = /rechnung|invoice/i.test(text) ? 'rechnung' : /kontoauszug/i.test(text) ? 'kontoauszug' : /versicherungsschein|police/i.test(text) ? 'versicherung' : /vertrag/i.test(text) ? 'vertrag' : 'dokument';
    const bestDate = dates.find(item => item.score >= 0);
    const uniqueAmounts = [...new Set(amounts)];
    return { date: bestDate?.value || '', sender: safe(sender).split('_').slice(0, 3).join('_'), type: documentType,
      amount: uniqueAmounts.length === 1 ? String(uniqueAmounts[0]) : '',
      warnings: [!bestDate && 'Kein eindeutiges Dokumentdatum: Aufnahmedatum verwendet.', !sender && 'Absender bitte ergänzen.', uniqueAmounts.length > 1 && 'Mehrere Gesamtbeträge: Betrag bitte prüfen.'].filter(Boolean) };
  }
  function filename(meta, takenDate) {
    const date = (meta.date || takenDate).replace(/-/g, '').slice(2);
    const amount = String(meta.amount || '').trim();
    const number = Number(amount.replace(',', '.'));
    return `${date}_${safe(meta.sender) || 'dokument'}_${safe(meta.type) || 'scan'}${amount && Number.isFinite(number) ? `.${Math.round(number)}€` : ''}`;
  }
  root.S2DMeta = { safe, senderKey, localDate, extract, filename };
  if (typeof module !== 'undefined') module.exports = root.S2DMeta;
})(typeof window !== 'undefined' ? window : globalThis);
