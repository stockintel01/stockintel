import ExcelJS from 'exceljs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass one or more workbook paths.');
const summaryOnly = process.env.WORKBOOK_SUMMARY === '1';

function displayValue(cell) {
  if (cell.formula) return `FORMULA:${cell.formula}`;
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  if (cell.value && typeof cell.value === 'object') {
    if ('result' in cell.value) return `FORMULA:${cell.value.formula ?? ''} => ${cell.value.result ?? ''}`;
    if ('richText' in cell.value) return cell.value.richText.map(part => part.text).join('');
    if ('text' in cell.value) return cell.value.text;
  }
  return cell.value ?? '';
}

function looksSensitive(value) {
  const text = String(value).trim();
  return /@|\+?\d[\d ()-]{7,}\d|prepared by|approved by|company|limited|ltd\b|location|address/i.test(text);
}

for (const file of files) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const report = {
    file: file.split(/[\\/]/).pop(),
    sheets: workbook.worksheets.map(sheet => {
      const formulas = [];
      const samples = [];
      const sensitiveCells = [];
      const nonEmptyRows = [];
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const values = [];
        row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
          const value = displayValue(cell);
          values[columnNumber - 1] = value;
          if (cell.formula && formulas.length < 12) formulas.push({ cell: cell.address, formula: cell.formula, result: cell.result });
          if (looksSensitive(value) && sensitiveCells.length < 12) sensitiveCells.push(cell.address);
        });
        nonEmptyRows.push(rowNumber);
        if (samples.length < 14) {
          samples.push({ row: rowNumber, values: values.slice(0, 20).map(value => looksSensitive(value) ? '[REDACTED]' : value) });
        }
      });
      return {
        name: sheet.name,
        state: sheet.state,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        actualRows: nonEmptyRows.length,
        merges: Object.keys(sheet._merges ?? {}).slice(0, 20),
        formulas,
        sensitiveCellCount: sensitiveCells.length,
        sensitiveCellExamples: sensitiveCells,
        samples,
      };
    }),
  };
  if (summaryOnly) {
    report.sheets = report.sheets.map(sheet => ({
      name: sheet.name,
      state: sheet.state,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      actualRows: sheet.actualRows,
      formulaCount: sheet.formulas.length,
      sensitiveCellCount: sheet.sensitiveCellCount,
    }));
  }
  console.log(JSON.stringify(report));
}
