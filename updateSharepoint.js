import fs from 'fs';
import path from 'path';
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import dotenv from 'dotenv';
import xlsx from 'xlsx';
dotenv.config();

// Configuración de autenticación
const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const siteUrl = process.env.SHAREPOINT_URL;

console.log(`Tenant ID: ${tenantId}`);
console.log(`Client ID: ${clientId}`);
console.log(`Client Secret: ${clientSecret}`);

// Autenticación utilizando Client Credentials
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

// Crear una instancia del cliente de Microsoft Graph
const client = Client.init({
    authProvider: async (done) => {
        try {
            const token = await credential.getToken("https://graph.microsoft.com/.default");
            done(null, token.token);
        } catch (error) {
            console.error("Error obteniendo el token:", error);
            done(error, null);
        }
    },
});

// Obtener el ID de una lista de SharePoint por su nombre
async function getListIdByName(siteId, listName) {
    try {
        const listResponse = await client.api(`/sites/${siteId}/lists`).filter(`displayName eq '${listName}'`).get();

        if (listResponse.value.length > 0) {
            console.log(`Lista encontrada: ${listResponse.value[0].id}`);
            return listResponse.value[0].id;
        } else {
            throw new Error(`Lista con nombre '${listName}' no encontrada.`);
        }
    } catch (error) {
        console.error("Error obteniendo el ID de la lista:", error);
        throw error;
    }
}

async function getItemsFromSharePointList(siteId, listId) {
    try {
        // Hacer la solicitud GET para obtener los elementos de la lista
        const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
        .expand('fields($select=PATENTE,ODOMETRO)')
        .get();
        const filteredItems = response.value.map(item => ({
            PATENTE: item.fields.PATENTE,
            ODOMETRO: item.fields.ODOMETRO
        }));
        
        
        // Mostrar los elementos por consola
        //console.log("Elementos en la lista:", response.value);
        console.log("Elementos en la lista:", filteredItems);
        return response.value;
    } catch (error) {
        console.error("Error obteniendo los elementos de la lista:", error);
        throw error;
    }
}

// Leer datos desde una lista de SharePoint y crear un diccionario de mapeo
async function createChassisToPatentMap(siteId, listId) {
    try {
      let items = [];
      let hasMoreItems = true;
      let nextLink = null;
  
      while (hasMoreItems) {
        const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
          .expand('fields')
          .top(500) // Ajusta este valor según tus necesidades
          .skipToken(nextLink)
          .get();
  
        items = items.concat(response.value);
        hasMoreItems = response.hasMore;
        nextLink = response.nextLink;
      }
  
      console.log("Total de elementos obtenidos:", items.length);
      console.log("items de la api", items[0]);
      const map = {};
      let contador = 0;
  
      items.forEach(item => {
        //let chassis = item.fields['field_18']; //para la lista de FLOTA_BRANDA
        //let patent = item.fields['field_11']; 
        let chassis = item.fields['field_12'];
        let patent = item.fields['field_5'];
  
        //console.log(`Chassis: ${chassis}, Patent: ${patent}`);
  
        if (patent) { // Verificar solo si la patente está presente
            if (chassis) {
                const relevantChassisPart = chassis.slice(-8);
                map[relevantChassisPart] = patent;
                map[chassis] = patent;
            }

            // Agregar patente sin guiones al mapa si no existe
            const patentWithoutHyphens = patent.replace(/-/g, '');
            if (!map[patentWithoutHyphens]) {
                map[patentWithoutHyphens] = patent;
            }
            contador++;
        }
      });
      console.log("Diccionario de mapeo creado:", map);
      console.log(`Se han añadido ${contador} elementos al diccionario de mapeo.`);
      return map;
    } catch (error) {
      console.error("Error obteniendo datos de SharePoint:", error);
      throw error;
    }
}

// Función para normalizar la patente `
function normalizePatent(patent, chassisToPatentMap) {
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

// Leer datos desde múltiples archivos JSON y combinarlos en uno solo
function readJsonData(chassisToPatentMap) {
    const jsonDirectory = './';
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

// Crear o obtener una lista de SharePoint y añadir columnas
async function createOrGetSharePointList(siteId, listName, description) {
    try {
        const listResponse = await client.api(`/sites/${siteId}/lists`).filter(`displayName eq '${listName}'`).get();

        if (listResponse.value.length > 0) {
            console.log(`Lista encontrada: ${listResponse.value[0].id}`);
            return listResponse.value[0].id;
        }

        const newListData = {
            displayName: listName,
            columns: [
                { name: "PATENTE", text: {} },
                { name: "LOCALIZACION_REAL", text: {} },
                { name: "ODOMETRO", text: {} },
                { name: "HOROMETRO", text: {} },
                { name: "ULTIMA_ACTUALIZACION", text: {} },
                { name: "FUENTE", text: {} }
            ],
            list: {
                template: "genericList"
            },
            description: description
        };

        const createResponse = await client.api(`/sites/${siteId}/lists`).post(newListData);
        console.log("Lista creada exitosamente:", createResponse);
        await indexColumn(siteId, createResponse.id, 'PATENTE');
        return createResponse.id;
    } catch (error) {
        console.error("Error creando u obteniendo la lista de SharePoint:", error);
        throw error;
    }
}

// Función para indexar una columna de SharePoint
async function indexColumn(siteId, listId, columnName) {
    try {
        await client.api(`/sites/${siteId}/lists/${listId}/columns/${columnName}`).update({ indexed: true });
        console.log(`Columna '${columnName}' indexada exitosamente.`);
    } catch (error) {
        console.error(`Error indexando la columna '${columnName}':`, error);
        throw error;
    }
}

// Verificar si un elemento ya existe en la lista de SharePoint
async function getListItemByPatent(siteId, listId, patent) {
    try {
        const response = await client.api(`/sites/${siteId}/lists/${listId}/items`).filter(`fields/PATENTE eq '${patent}'`).get();
        return response.value.length > 0 ? response.value[0] : null;
    } catch (error) {
        console.error("Error obteniendo el elemento por patente:", error);
        throw error;
    }
}

// Crear o actualizar elementos en la lista de SharePoint
async function addOrUpdateItemsToSharePointList(siteId, listId, items) {
    try {
        let contador = 0;
        console.log("items.lengh",items.length);
        for (const item of items) {
            const existingItem = await getListItemByPatent(siteId, listId, item.patent);

            if (existingItem) {
                const updatedItem = {
                    fields: {
                        PATENTE: item.patent,
                        LOCALIZACION_REAL: item.location,
                        ODOMETRO: item.odometer,
                        HOROMETRO: item.hourometer,
                        ULTIMA_ACTUALIZACION: item.lastUpdate,
                        FUENTE: item.source
                    }
                };

                await client.api(`/sites/${siteId}/lists/${listId}/items/${existingItem.id}`).patch(updatedItem);
                console.log(`Elemento actualizado: ${item.patent}`); contador++;
            } else {
                const newItem = {
                    fields: {
                        PATENTE: item.patent,
                        LOCALIZACION_REAL: item.location,
                        ODOMETRO: item.odometer,
                        HOROMETRO: item.hourometer,
                        ULTIMA_ACTUALIZACION: item.lastUpdate,
                        FUENTE: item.source
                    }
                };

                await client.api(`/sites/${siteId}/lists/${listId}/items`).post(newItem);
                console.log(`Elemento añadido a la lista: ${item.patent}`); contador++;
            }
        } console.log(`Se han actualizado ${contador} elementos en la lista de SharePoint.`);
    } catch (error) {
        console.error("Error añadiendo o actualizando elementos en la lista de SharePoint:", error);
    }
}

// Ejecutar las funciones
(async () => {
    try {
        const siteId = await getSiteId();
        const GpsListId = await createOrGetSharePointList(siteId, "GPS_PRUEBA", "Lista con datos extraídos mediante scraping");
        const flotaListId = await getListIdByName(siteId, "07_JULIO_PRUEBA");
        const chassisToPatentMap = await createChassisToPatentMap(siteId, flotaListId);
        const data = readJsonData(chassisToPatentMap);

        //await addOrUpdateItemsToSharePointList(siteId, GpsListId, data);
        //const items = await getItemsFromSharePointList(siteId, listId);
        //console.log("Items en la lista de SharePoint:", items);
    } catch (error) {
        console.error("Error en la ejecución:", error);
    }
})();

// Función auxiliar para obtener el ID del sitio de SharePoint
async function getSiteId() {
    try {
        const siteResponse = await client.api(`/sites/brandacl.sharepoint.com:/sites/CAPSTONE`).get();
        console.log("ID del sitio:", siteResponse.id);
        return siteResponse.id;
    } catch (error) {
        console.error("Error obteniendo el ID del sitio:", error);
        throw error;
    }
}