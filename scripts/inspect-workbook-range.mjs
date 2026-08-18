import ExcelJS from 'exceljs';

const [file, sheetName, startRowArg = '1', endRowArg = '40', endColumnArg = '30'] = process.argv.slice(2);
if (!file || !sheetName) throw new Error('Usage: node inspect-workbook-range.mjs <file> <sheet> [startRow] [endRow] [endColumn]');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(file);
const sheet = workbook.getWorksheet(sheetName);
if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

const startRow = Number(startRowArg);
const endRow = Number(endRowArg);
const endColumn = Number(endColumnArg);
const sensitivePattern = /@|\+?\d[\d ()-]{7,}\d|prepared by|approved by|company|limited|ltd\b|address/i;

function valueFor(cell) {
  const value = cell.value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return value.text;
    if ('result' in value) return value.result ?? '';
  }
  return value ?? '';
}

for (let rowNumber = startRow; rowNumber <= Math.min(endRow, sheet.rowCount); rowNumber += 1) {
  const row = sheet.getRow(rowNumber);
  const values = [];
  for (let columnNumber = 1; columnNumber <= Math.min(endColumn, sheet.columnCount); columnNumber += 1) {
    const raw = valueFor(row.getCell(columnNumber));
    const text = String(raw).replace(/\s+/g, ' ').trim();
    values.push(sensitivePattern.test(text) ? '[REDACTED]' : text);
  }
  while (values.at(-1) === '') values.pop();
  if (values.some(Boolean)) console.log(JSON.stringify({ row: rowNumber, values }));
}
