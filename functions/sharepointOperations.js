import { client } from './authClient.js';

export async function getSiteId() {
    try {
        const siteResponse = await client.api(`/sites/brandacl.sharepoint.com:/sites/CAPSTONE`).get();
        console.log("ID del sitio:", siteResponse.id);
        return siteResponse.id;
    } catch (error) {
        console.error("Error obteniendo el ID del sitio:", error);
        throw error;
    }
}

export async function getListIdByName(siteId, listName) {
    try {
        const listResponse = await client.api(`/sites/${siteId}/lists`).filter(`displayName eq '${listName}'`).get();
        if (listResponse.value.length > 0) {
            console.log(`Lista encontrada: ${listResponse.value[0].id}`);
            return listResponse.value[0]?.id;
        } else {
            throw new Error(`Lista con nombre '${listName}' no encontrada.`);
        }
    } catch (error) {
        console.error("Error obteniendo el ID de la lista:", error);
        throw error;
    }
}

export async function createOrGetSharePointList(siteId, listName, description) {
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
                { name: "FUENTE", text: {} },
                { name: "COSTO_GPS", number: {} },
                { name: "LATITUD", number: {} },
                { name: "LONGITUD", number: {} }
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

export async function indexColumn(siteId, listId, columnName) {
    try {
        await client.api(`/sites/${siteId}/lists/${listId}/columns/${columnName}`).update({ indexed: true });
        console.log(`Columna '${columnName}' indexada exitosamente.`);
    } catch (error) {
        console.error(`Error indexando la columna '${columnName}':`, error);
        throw error;
    }
}

export async function getListItemByPatent(siteId, listId, patent) {
    try {
        const response = await client.api(`/sites/${siteId}/lists/${listId}/items`).filter(`fields/PATENTE eq '${patent}'`).get();
        return response.value.length > 0 ? response.value[0] : null;
    } catch (error) {
        console.error("Error obteniendo el elemento por patente:", error);
        throw error;
    }
}

export async function addOrUpdateItemsToSharePointList(siteId, listId, items) {
    try {
        function determinarCosto(source) {
            switch (source) {
                case 'Cubiq':
                    return 0; 
                case 'Volvo Connect':
                    return 0; 
                case 'Orvis GPS':
                    return 0.67; 
                default:
                    return 0; 
            }
        }
        let contador = 0;
        console.log("items.lengh",items.length);
        for (const item of items) {
            const existingItem = await getListItemByPatent(siteId, listId, item.patent);
            const costoGPS = determinarCosto(item.source);
            if (existingItem) {
                const updatedItem = {
                    fields: {
                        PATENTE: item.patent,//TODO: revisar si es necesario actualizar la patente
                        LOCALIZACION_REAL: item.location,
                        ODOMETRO: item.odometer,
                        HOROMETRO: item.hourometer,
                        ULTIMA_ACTUALIZACION: item.lastUpdate,
                        FUENTE: item.source,
                        COSTO_GPS: costoGPS,
                        LATITUD: item.latitude,
                        LONGITUD: item.longitude
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
                        FUENTE: item.source,
                        COSTO_GPS: costoGPS,
                        LATITUD: item.latitude,
                        LONGITUD: item.longitude
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