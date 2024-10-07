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

// Leer el archivo Excel y crear un diccionario de mapeo
function createChassisToPatentMap(excelFilePath) {
    const workbook = xlsx.readFile(excelFilePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const map = {};
    data.forEach(row => {
        let chassis = row['N° CHASSIS'];
        let patent = row['PATENTE'];
        if (chassis && patent) {
            chassis = String(chassis);
            const relevantChassisPart = chassis.slice(-8);
            map[relevantChassisPart] = patent;
            map[chassis] = patent;

            // Agregar patente sin guiones al mapa si no existe
            const patentWithoutHyphens = patent.replace(/-/g, '');
            if (!map[patentWithoutHyphens]) {
                map[patentWithoutHyphens] = patent;
            }
        }
    });
    console.log("map:", map);
    return map;
}

// Función para normalizar la patente
function normalizePatent(patent, chassisToPatentMap) {
    console.log("patent:", patent);

    // Si la patente ya tiene guiones, devolverla tal cual
    if (patent.includes('-')) {
        console.log("Patente ya tiene guiones:", patent);
        return patent;
    }

    // Buscar la patente sin guiones en el diccionario
    const normalizedPatent = chassisToPatentMap[patent];
    if (normalizedPatent) {
        console.log("Patente encontrada sin guiones en el diccionario:", normalizedPatent);
        return normalizedPatent;
    }
    console.log("La patente", patent, "pasó el segundo if");

    // Intentar buscar la patente con guiones
    const patentWithHyphens = patent.slice(0, 4) + '-' + patent.slice(4);
    console.log("Buscando patente con guiones:", patentWithHyphens);
    const normalizedPatentWithHyphens = chassisToPatentMap[patentWithHyphens];
    if (normalizedPatentWithHyphens) {
        console.log("Patente encontrada con guiones en el diccionario:", normalizedPatentWithHyphens);
        return normalizedPatentWithHyphens;
    }
    console.log("La patente", patent, "pasó el tercer if");

    // Buscar la patente como subcadena en el diccionario
    for (const key in chassisToPatentMap) {
        if (key.includes(patent)) {
            console.log("Patente encontrada como subcadena en el diccionario:", chassisToPatentMap[key]);
            return chassisToPatentMap[key];
        }
    }

    // Si no se encuentra en el diccionario, devolver la patente original
    return patent;
}

// Leer datos desde múltiples archivos JSON y combinarlos en uno solo
function readJsonData(chassisToPatentMap) {
    const jsonDirectory = './';
    const jsonFiles = fs.readdirSync(jsonDirectory).filter(file => 
        file.endsWith('.json') && !['package-lock.json', 'package.json', 'tsconfig.json'].includes(file)
    );
    
    let combinedData = [];

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
            jsonData.forEach(item => {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    item.patent = normalizePatent(item.patent, chassisToPatentMap);
                    combinedData.push(item);
                } else {
                    console.warn(`Invalid item in file ${file}:`, item);
                }
            });
        } else {
            console.warn(`File ${file} does not contain a valid array of objects.`);
        }
    });

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
        const listId = await createOrGetSharePointList(siteId, "GPS_PRUEBA", "Lista con datos extraídos mediante scraping");

        const chassisToPatentMap = createChassisToPatentMap('./Vehiculos Grupo Ravazzano - Septiembre 24 FINAL1.xlsx');
        const data = readJsonData(chassisToPatentMap);

        await addOrUpdateItemsToSharePointList(siteId, listId, data);
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