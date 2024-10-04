import fs from 'fs';
import path from 'path';
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import dotenv from 'dotenv';
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

// Leer datos desde múltiples archivos JSON y combinarlos en uno solo
function readJsonData() {
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

        // Verificar que jsonData sea un array y que contenga objetos válidos
        if (Array.isArray(jsonData)) {
            jsonData.forEach(item => {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
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
        // Intenta obtener la lista primero
        const listResponse = await client.api(`/sites/${siteId}/lists`).filter(`displayName eq '${listName}'`).get();

        if (listResponse.value.length > 0) {
            console.log(`Lista encontrada: ${listResponse.value[0].id}`);
            return listResponse.value[0].id; // Devuelve el ID si la lista ya existe
        }

        // Si la lista no existe, créala
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
        // Indexar la columna 'PATENTE' después de crear la lista
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
        const columnUpdateResponse = await client
            .api(`/sites/${siteId}/lists/${listId}/columns/${columnName}`)
            .update({
                indexed: true,
            });
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
        for (const item of items) {
            const existingItem = await getListItemByPatent(siteId, listId, item.patent);

            if (existingItem) {
                // Actualizar el elemento existente
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

                await client
                    .api(`/sites/${siteId}/lists/${listId}/items/${existingItem.id}`)
                    .patch(updatedItem);

                console.log(`Elemento actualizado: ${item.patent}`);
            } else {
                // Crear un nuevo elemento
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

                await client
                    .api(`/sites/${siteId}/lists/${listId}/items`)
                    .post(newItem);

                console.log(`Elemento añadido a la lista: ${item.patent}`);
            }
        }
    } catch (error) {
        console.error("Error añadiendo o actualizando elementos en la lista de SharePoint:", error);
    }
}

// Ejecutar las funciones
(async () => {
    try {
        const siteId = await getSiteId();
        const listId = await createOrGetSharePointList(siteId, "GPS", "Lista con datos extraídos mediante scraping");
        const data = readJsonData();
        await addOrUpdateItemsToSharePointList(siteId, listId, data);
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