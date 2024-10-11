import xlsx from 'xlsx';

// Ruta de los archivos Excel
const allScrapingFile = './AllScraping.xlsx'; // Primer archivo con PATENTE y FUENTE
const julioFile = './07_julio.xlsx'; // Segundo archivo donde necesitas modificar FUENTE

// Lee el primer archivo 'AllScraping'
const allScrapingWorkbook = xlsx.readFile(allScrapingFile);
const allScrapingSheet = allScrapingWorkbook.Sheets['Hoja1']; // Hoja con las patentes y fuente
const allScrapingData = xlsx.utils.sheet_to_json(allScrapingSheet);

// Lee el segundo archivo '07_julio'
const julioWorkbook = xlsx.readFile(julioFile);
const julioSheet = julioWorkbook.Sheets['BD.CONTABILIDAD']; // Hoja donde modificarás la columna FUENTE
const julioData = xlsx.utils.sheet_to_json(julioSheet);

// Función para normalizar las patentes eliminando guiones
const normalizePatente = (patente) => {
    if (typeof patente !== 'string') {
      const stringPatente = String(patente); // Lo convierte a string si no lo es
      return stringPatente.replace(/-/g, '').toUpperCase(); // Elimina guiones y convierte a mayúsculas
    }
    return patente.replace(/-/g, '').toUpperCase(); // Elimina guiones y convierte a mayúsculas
};

// Crear un diccionario de 'patente: fuente' del primer Excel para búsqueda rápida
const patenteFuenteMap = {};
allScrapingData.forEach(row => {
  const normalizedPatente = normalizePatente(row.PATENTE); // Normaliza la patente
  patenteFuenteMap[normalizedPatente] = row.FUENTE; // Asigna la fuente basada en la patente normalizada
});

// Contadores para las diferentes fuentes y listas de patentes no asignadas
let cubiqCount = 0;
let volvoConnectCount = 0;
let orvisGpsCount = 0;
let noMatchCount = 0;

const cubiqMissing = [];
const volvoConnectMissing = [];
const orvisGpsMissing = [];

// Recorre los datos del segundo Excel y actualiza la columna FUENTE
julioData.forEach(row => {
  const normalizedPatente = normalizePatente(row.PATENTE); // Normaliza la patente en el segundo Excel
  const fuente = patenteFuenteMap[normalizedPatente]; // Busca la fuente para la patente

  if (fuente) { // Si la patente normalizada existe en el primer Excel
    row.FUENTE = fuente; // Actualiza la fuente en el segundo Excel
    
    // Incrementa los contadores según la fuente
    if (fuente === 'Cubiq') {
      cubiqCount++;
    } else if (fuente === 'Volvo Connect') {
      volvoConnectCount++;
    } else if (fuente === 'Orvis GPS') {
      orvisGpsCount++;
    }
  } else {
    noMatchCount++; // Contabiliza las patentes que no encontraron coincidencia
  }
});

// Verificar patentes que no fueron asignadas
allScrapingData.forEach(row => {
  const normalizedPatente = normalizePatente(row.PATENTE);
  const fuente = row.FUENTE;

  if (fuente === 'Cubiq' && !julioData.some(julioRow => normalizePatente(julioRow.PATENTE) === normalizedPatente)) {
    cubiqMissing.push(row.PATENTE);
  } else if (fuente === 'Volvo Connect' && !julioData.some(julioRow => normalizePatente(julioRow.PATENTE) === normalizedPatente)) {
    volvoConnectMissing.push(row.PATENTE);
  } else if (fuente === 'Orvis GPS' && !julioData.some(julioRow => normalizePatente(julioRow.PATENTE) === normalizedPatente)) {
    orvisGpsMissing.push(row.PATENTE);
  }
});

// Convierte los datos modificados de vuelta a una hoja de Excel
const newJulioSheet = xlsx.utils.json_to_sheet(julioData);

// Reemplaza la hoja original por la hoja modificada en el libro de Excel
julioWorkbook.Sheets['BD.CONTABILIDAD'] = newJulioSheet;

// Guarda el archivo Excel modificado
xlsx.writeFile(julioWorkbook, '07_julio_modificado.xlsx');

// Muestra los resultados en la consola
console.log('El archivo 07_julio_modificado.xlsx ha sido actualizado con la información de la FUENTE.');
console.log(`Registros agregados para Cubiq: ${cubiqCount}`);
console.log(`Registros agregados para Volvo Connect: ${volvoConnectCount}`);
console.log(`Registros agregados para Orvis GPS: ${orvisGpsCount}`);
console.log(`Registros que no encontraron coincidencia: ${noMatchCount}`);

// Mostrar patentes que no fueron asignadas
if (cubiqMissing.length > 0) {
  console.log('Patentes de Cubiq que no fueron asignadas:', cubiqMissing.join(', '));
}
if (volvoConnectMissing.length > 0) {
  console.log('Patentes de Volvo Connect que no fueron asignadas:', volvoConnectMissing.join(', '));
}
if (orvisGpsMissing.length > 0) {
  console.log('Patentes de Orvis GPS que no fueron asignadas:', orvisGpsMissing.join(', '));
}