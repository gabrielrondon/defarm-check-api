import XLSX from 'xlsx';
import { writeFileSync } from 'fs';

// Le o arquivo Excel
const workbook = XLSX.readFile('data/lista_suja.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Converte para JSON
const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

console.log(`Total de linhas no Excel: ${rawData.length}`);

// Filtrar e normalizar dados (remover headers/footers)
const normalized = rawData
  .filter((row: any) => {
    // Filtrar apenas linhas com CPF/CNPJ
    const doc = row['__EMPTY_4'];
    return doc && typeof doc === 'string' && (doc.includes('.') || doc.includes('/'));
  })
  .map((row: any) => {
    const document = String(row['__EMPTY_4']).replace(/\D/g, '');
    const isCNPJ = document.length === 14;
    const isCPF = document.length === 11;

    return {
      document: document,
      documentFormatted: row['__EMPTY_4'],
      type: isCNPJ ? 'CNPJ' : isCPF ? 'CPF' : 'UNKNOWN',
      name: row['__EMPTY_2'],
      year: row['__EMPTY'],
      state: row['__EMPTY_1'],
      address: row['__EMPTY_7'],
      workersAffected: row['__EMPTY_8'],
      cnae: row['__EMPTY_11'],
      inclusionDate: row['__EMPTY_15']
    };
  })
  .filter(item => item.type !== 'UNKNOWN');

console.log(`\n✅ Registros válidos extraídos: ${normalized.length}`);
console.log('\nPrimeiros 3 registros processados:');
console.log(JSON.stringify(normalized.slice(0, 3), null, 2));

// Salvar JSON normalizado
writeFileSync('data/lista_suja.json', JSON.stringify(normalized, null, 2));
console.log('\n✅ Arquivo salvo em data/lista_suja.json');

// Estatísticas
const cpfCount = normalized.filter(r => r.type === 'CPF').length;
const cnpjCount = normalized.filter(r => r.type === 'CNPJ').length;

console.log(`\n📊 Estatísticas:`);
console.log(`- CPFs (pessoas físicas): ${cpfCount}`);
console.log(`- CNPJs (pessoas jurídicas): ${cnpjCount}`);
console.log(`- Total: ${normalized.length}`);

// Criar index simples por documento para busca rápida
const index = new Map(normalized.map(r => [r.document, r]));
console.log(`\n✅ Index criado com ${index.size} documentos únicos`);

// Exemplos de CNPJs/CPFs para teste
const testCases = normalized.slice(0, 5).map(r => ({
  document: r.documentFormatted,
  name: r.name
}));

console.log('\n🧪 Casos de teste (use estes para testar a API):');
console.log(JSON.stringify(testCases, null, 2));
