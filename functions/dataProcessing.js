import fs from 'fs';
import path from 'path';
import { client } from './authClient.js';

export async function createChassisToPatentMap(siteId, listId) {
    try {
      let items = [];
      let hasMoreItems = true;
      let nextLink = null;
  
      while (hasMoreItems) {
        const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
          .expand('fields').top(500).skipToken(nextLink).get();
  
        items = items.concat(response.value);
        hasMoreItems = response.hasMore;
        nextLink = response.nextLink;
      }
  
      console.log("Total de elementos obtenidos:", items.length);
      const map = {};
      let contador = 0;
      //console.log("items", items[0]);
      items.forEach(item => {
        let chassis = item.fields['field_19']; //para la lista de BASE_FLOTA
        let patent = item.fields['field_11']; //para la lista de BASE_FLOTA
        if (patent) { // Verificar solo si la patente está presente
            if (chassis) {
                const relevantChassisPart = chassis.slice(-8);
                map[relevantChassisPart] = patent;
                map[chassis] = patent;
            }
            const patentWithoutHyphens = patent.replace(/-/g, '');// Agregar patente sin guiones al mapa si no existe
            if (!map[patentWithoutHyphens]) {
                map[patentWithoutHyphens] = patent;
            }
            contador++;
        }
      });
      //console.log("Diccionario de mapeo creado:", map);
      console.log(`Se han añadido ${contador} elementos al diccionario de mapeo.`);
      return map;
    } catch (error) {
      console.error("Error obteniendo datos de SharePoint:", error);
      throw error;
    }
}

export function normalizePatent(patent, chassisToPatentMap) {
    console.log("Normalizing patent:", patent);
    // Eliminar cualquier guion de la patente
    const normalizedPatent = patent.replace(/-/g, '');
    // Buscar la patente normalizada en el diccionario
    const mappedPatent = chassisToPatentMap[normalizedPatent];
    if (mappedPatent) {
        console.log("Patente encontrada en el diccionario:", mappedPatent);
        return mappedPatent;
    }
    // Si no se encuentra en el diccionario, devolver la patente normalizada
    console.log("No se pudo encontrar la patente en el diccionario, devolviendo la patente normalizada:", patent);
    return null;
}

export function readJsonData(chassisToPatentMap) {
    const jsonDirectory = '../puppeteer-overview/output';
    const jsonFiles = fs.readdirSync(jsonDirectory).filter(file => 
        file.endsWith('.json') && !['package-lock.json', 'package.json', 'tsconfig.json'].includes(file)
    );

    let combinedData = [];
    let contador = 0;
    let contadorNormalizePatent = 0;
    let failedPatents = [];
    jsonFiles.forEach(file => {
        const rawData = fs.readFileSync(path.join(jsonDirectory, file));
        let jsonData;
        try {
            jsonData = JSON.parse(rawData);
        } catch (error) {
            console.error(`Error parsing JSON from file ${file}:`, error);
            return;
        }

        if (Array.isArray(jsonData)) {
            
            jsonData.forEach(async item => {
                contador++;
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const normalizedPatent = normalizePatent(item.patent, chassisToPatentMap);
                    if (normalizedPatent) {
                        contadorNormalizePatent++;
                        item.patent = normalizedPatent;
                        combinedData.push(item);
                    } else {
                        failedPatents.push(item.patent); // Agregar la patente fallida al array
                    }
                } else {
                    console.warn(`Invalid item in file ${file}:`, item);
                }
            });
        } else {
            console.warn(`File ${file} does not contain a valid array of objects.`);
        }
    });
    if (failedPatents.length > 0) {
        console.log("Patentes que no se pudieron normalizar:", failedPatents);
    } else {
        console.log("Todas las patentes se normalizaron correctamente.");
    }
    console.log(`Total de elementos procesados: ${contador}`);
    console.log(`Total de patentes normalizadas: ${contador - failedPatents.length}`);
    return combinedData;
}