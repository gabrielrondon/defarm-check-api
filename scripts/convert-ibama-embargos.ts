import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

console.log('🔍 Processando dados IBAMA Embargos...\n');

// Ler arquivo CSV
const csvData = readFileSync('data/termo_embargo.csv', 'utf-8');

// Parse CSV (delimitador é ponto-e-vírgula)
const records = parse(csvData, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true
});

console.log(`Total de registros no CSV: ${records.length}`);

// Filtrar e normalizar (apenas embargos ativos)
const normalized = records
  .filter((row: any) => {
    // Filtrar apenas embargos ativos (não desembargados)
    const isActive = row.SIT_DESEMBARGO !== 'S' && row.DES_STATUS_FORMULARIO !== 'Cancelado';
    const hasDoc = row.CPF_CNPJ_EMBARGADO && row.CPF_CNPJ_EMBARGADO.trim().length > 0;
    return isActive && hasDoc;
  })
  .map((row: any) => {
    const document = String(row.CPF_CNPJ_EMBARGADO || '').replace(/\D/g, '');
    const isCNPJ = document.length === 14;
    const isCPF = document.length === 11;

    return {
      document: document,
      documentFormatted: row.CPF_CNPJ_EMBARGADO,
      type: isCNPJ ? 'CNPJ' : isCPF ? 'CPF' : 'UNKNOWN',
      name: row.NOME_EMBARGADO,
      embargoNumber: row.NUM_TAD,
      embargoDate: row.DAT_EMBARGO,
      status: row.DES_STATUS_FORMULARIO,
      processNumber: row.NUM_PROCESSO,
      description: row.DES_TAD ? row.DES_TAD.substring(0, 200) : '',
      municipality: row.MUNICIPIO,
      state: row.UF,
      location: row.DES_LOCALIZACAO,
      area_ha: row.QTD_AREA_EMBARGADA ? parseFloat(row.QTD_AREA_EMBARGADA.replace(',', '.')) : null,
      propertyName: row.NOME_IMOVEL,
      coordinates: {
        lat: row.NUM_LATITUDE_TAD ? parseFloat(row.NUM_LATITUDE_TAD) : null,
        lon: row.NUM_LONGITUDE_TAD ? parseFloat(row.NUM_LONGITUDE_TAD) : null
      },
      lastUpdate: row.ULTIMA_ATUALIZACAO_RELATORIO
    };
  })
  .filter((item: any) => item.type !== 'UNKNOWN');

console.log(`\n✅ Embargos ativos extraídos: ${normalized.length}`);

// Agrupar por CPF/CNPJ (um documento pode ter múltiplos embargos)
const groupedByDoc = new Map<string, any[]>();

normalized.forEach((embargo: any) => {
  const existing = groupedByDoc.get(embargo.document) || [];
  existing.push(embargo);
  groupedByDoc.set(embargo.document, existing);
});

// Criar estrutura final: documento -> lista de embargos
const finalData = Array.from(groupedByDoc.entries()).map(([document, embargos]) => {
  const first = embargos[0];
  return {
    document,
    documentFormatted: first.documentFormatted,
    type: first.type,
    name: first.name,
    embargoCount: embargos.length,
    totalArea_ha: embargos.reduce((sum, e) => sum + (e.area_ha || 0), 0),
    embargos: embargos.map(e => ({
      embargoNumber: e.embargoNumber,
      date: e.embargoDate,
      municipality: e.municipality,
      state: e.state,
      area_ha: e.area_ha,
      description: e.description,
      coordinates: e.coordinates
    }))
  };
});

console.log('\nPrimeiros 3 registros processados:');
console.log(JSON.stringify(finalData.slice(0, 3), null, 2));

// Salvar JSON
writeFileSync('data/ibama_embargos.json', JSON.stringify(finalData, null, 2));
console.log(`\n✅ Arquivo salvo em data/ibama_embargos.json`);

// Estatísticas
const cpfCount = finalData.filter(r => r.type === 'CPF').length;
const cnpjCount = finalData.filter(r => r.type === 'CNPJ').length;
const totalEmbargos = finalData.reduce((sum, r) => sum + r.embargoCount, 0);
const totalArea = finalData.reduce((sum, r) => sum + r.totalArea_ha, 0);

console.log(`\n📊 Estatísticas:`);
console.log(`- CPFs únicos embargados: ${cpfCount}`);
console.log(`- CNPJs únicos embargados: ${cnpjCount}`);
console.log(`- Total de documentos: ${finalData.length}`);
console.log(`- Total de embargos: ${totalEmbargos}`);
console.log(`- Área total embargada: ${totalArea.toFixed(2)} ha`);

// Casos de teste
const testCases = finalData.slice(0, 5).map(r => ({
  document: r.documentFormatted,
  name: r.name,
  embargoCount: r.embargoCount
}));

console.log('\n🧪 Casos de teste (use estes para testar a API):');
console.log(JSON.stringify(testCases, null, 2));
