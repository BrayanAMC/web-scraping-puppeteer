import { client } from '../functions/authClient.js';
import { getSiteId, getListIdByName } from '../functions/sharepointOperations.js';
import ExcelJS from 'exceljs'; 

async function standardizeVehicleColumn(columnName) {
    try {
        const siteId = await getSiteId();
        const listId = await getListIdByName(siteId, "BASE_FLOTA");

        let items = [];
        let hasMoreItems = true;
        let nextLink = null;

        // Obtener todos los elementos de la lista
        while (hasMoreItems) {
            const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
                .expand('fields')
                .top(500)
                .skipToken(nextLink)
                .get();

            items = items.concat(response.value);
            hasMoreItems = response.hasMore;
            nextLink = response.nextLink;
        }

        // Obtener el nombre interno de la columna VEHICULO
        const columns = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
        const vehiculoColumnName = columns.value.find(col => col.displayName === columnName).name;

        // Actualizar cada elemento
        for (const item of items) {
            const vehiculo = item.fields[vehiculoColumnName];
            if (vehiculo) {
                //const standardizedVehiculo = vehiculo.charAt(0).toUpperCase() + vehiculo.slice(1).toLowerCase();
                const standardizedVehiculo = vehiculo
                    .replace(/\s+$/, '')
                    .split(' ')
                    .map((word, index) => {
                        const noAccentWord = removeAccents(word);
                        return index === 0 ? 
                            noAccentWord.charAt(0).toUpperCase() + noAccentWord.slice(1).toLowerCase() : 
                            noAccentWord.toLowerCase()
                    })
                    .join(' ');

                await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}`)
                    .update({
                        fields: {
                            [vehiculoColumnName]: standardizedVehiculo
                        }
                    });
            }
        }

        console.log(`Columna '${columnName}' estandarizada exitosamente.`);
    } catch (error) {
        console.error('Error al estandarizar la columna VEHICULO:', error);
    }
}

async function standardizeBankNames(columnName) {
    try {
        const siteId = await getSiteId();
        const listId = await getListIdByName(siteId, "BASE_FLOTA");

        let items = [];
        let hasMoreItems = true;
        let nextLink = null;

        // Mapeo de nombres de banco
        const bankMapping = {
            'BCI': 'BANCO BCI',
            'CHILE': 'BANCO DE CHILE',
            'ITAU': 'BANCO ITAU',
            'SANTANDER': 'BANCO SANTANDER'
        };

        // Obtener todos los elementos de la lista
        while (hasMoreItems) {
            const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
                .expand('fields')
                .top(500)
                .skipToken(nextLink)
                .get();

            items = items.concat(response.value);
            hasMoreItems = response.hasMore;
            nextLink = response.nextLink;
        }

        // Obtener el nombre interno de la columna
        const columns = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
        const bankColumnName = columns.value.find(col => col.displayName === columnName).name;

        let updateCount = 0;
        // Actualizar cada elemento
        for (const item of items) {
            const bankName = item.fields[bankColumnName];
            if (bankName && bankMapping[bankName.toUpperCase()]) {
                await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}`)
                    .update({
                        fields: {
                            [bankColumnName]: bankMapping[bankName.toUpperCase()]
                        }
                    });
                updateCount++;
                console.log(`Actualizado: ${bankName} -> ${bankMapping[bankName.toUpperCase()]}`);
            }
        }

        console.log(`Columna '${columnName}' estandarizada exitosamente. Se actualizaron ${updateCount} registros.`);
    } catch (error) {
        console.error('Error al estandarizar los nombres de bancos:', error);
    }
}

function removeAccents(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}


async function standardizeVehicleColumnVersion2Excel(columnName) {
    try {
        const siteId = await getSiteId();
        const listId = await getListIdByName(siteId, "BASE_FLOTA");
        let items = [];
        let hasMoreItems = true;
        let nextLink = null;

        while (hasMoreItems) {
            const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
                .expand('fields')
                .top(500)
                .skipToken(nextLink)
                .get();
            
            items = items.concat(response.value);
            hasMoreItems = response.hasMore;
            nextLink = response.nextLink;
        }

        const columns = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get();
        const vehiculoColumnName = columns.value.find(col => col.displayName === columnName).name;

        // Crear un nuevo libro de Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Vehiculos Estandarizados');

        // Añadir encabezados
        worksheet.columns = [
            { header: 'Original', key: 'original' },
            { header: 'Estandarizado', key: 'standardized' }
        ];

        // Procesar y guardar datos en Excel
        const processedItems = items.map(item => {
            const vehiculo = item.fields[vehiculoColumnName];
            if (vehiculo) {
                const standardizedVehiculo = vehiculo
                    .replace(/\s+$/, '')
                    .split(' ')
                    .map((word, index) => {
                        const noAccentWord = removeAccents(word);
                        return index === 0 ? 
                            noAccentWord.charAt(0).toUpperCase() + noAccentWord.slice(1).toLowerCase() : 
                            noAccentWord.toLowerCase()
                    })
                    .join(' ');
                
                return {
                    original: vehiculo,
                    standardized: standardizedVehiculo
                };
            }
            return null;
        }).filter(item => item !== null);

        // Añadir datos al worksheet
        worksheet.addRows(processedItems);

        // Guardar el archivo Excel
        await workbook.xlsx.writeFile('vehiculos_estandarizados.xlsx');

        console.log(`Archivo Excel generado con éxito para verificación.`);

        // Comentar la actualización en SharePoint
        /*
        await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}`)
            .update({
                fields: {
                    [vehiculoColumnName]: standardizedVehiculo
                }
            });
        */

    } catch (error) {
        console.error('Error al generar Excel de vehículos:', error);
    }
}

async function updateGPSColumn() {
    try {
        const siteId = await getSiteId();
        const baseFlotaListId = await getListIdByName(siteId, "BASE_FLOTA");
        const gpsListId = await getListIdByName(siteId, "GPS");
 
        // Obtener patentes de la tabla GPS
        let gpsPatentes = [];
        let hasMoreGpsItems = true;
        let gpsNextLink = null;
 
        while (hasMoreGpsItems) {
            const gpsResponse = await client.api(`/sites/${siteId}/lists/${gpsListId}/items`)
                .expand('fields')
                .top(500)
                .skipToken(gpsNextLink)
                .get();
            
            gpsPatentes = gpsPatentes.concat(
                gpsResponse.value.map(item => item.fields['PATENTE'])
            );
 
            hasMoreGpsItems = gpsResponse.hasMore;
            gpsNextLink = gpsResponse.nextLink;
        }
 
        // Obtener columnas de BASE_FLOTA
        const columns = await client.api(`/sites/${siteId}/lists/${baseFlotaListId}/columns`).get();
        const patenteColumnName = columns.value.find(col => col.displayName === 'PATENTE').name;
        const gpsColumnName = columns.value.find(col => col.displayName === 'GPS').name;
 
        // Obtener items de BASE_FLOTA
        let baseFlotaItems = [];
        let hasMoreBaseFlotaItems = true;
        let baseFlotaNextLink = null;
 
        while (hasMoreBaseFlotaItems) {
            const baseFlotaResponse = await client.api(`/sites/${siteId}/lists/${baseFlotaListId}/items`)
                .expand('fields')
                .top(500)
                .skipToken(baseFlotaNextLink)
                .get();
            
            baseFlotaItems = baseFlotaItems.concat(baseFlotaResponse.value);
 
            hasMoreBaseFlotaItems = baseFlotaResponse.hasMore;
            baseFlotaNextLink = baseFlotaResponse.nextLink;
        }
 
        // Actualizar columna GPS en BASE_FLOTA
        for (const item of baseFlotaItems) {
            const patente = item.fields[patenteColumnName];
            const gpsValue = gpsPatentes.includes(patente) ? 'Si' : 'No';
 
            await client.api(`/sites/${siteId}/lists/${baseFlotaListId}/items/${item.id}`)
                .update({
                    fields: {
                        [gpsColumnName]: gpsValue
                    }
                });
        }
 
        console.log('Columna GPS actualizada exitosamente.');
 
    } catch (error) {
        console.error('Error al actualizar columna GPS:', error);
    }
 }




//standardizeVehicleColumn("VEHICULO");
//standardizeVehicleColumn("MARCA");
//standardizeVehicleColumn("TIPO");
//standardizeVehicleColumn("COLOR");
//standardizeBankNames("BANCO"); // Reemplazar "BANCO" con el nombre real de la columna
//standardizeVehicleColumnVersion2Excel("VEHICULO");
//standardizeVehicleColumn("COMBUSTIBLE");
//standardizeVehicleColumnVersion2Excel("PCTCOD");
//standardizeVehicleColumn("GPS");
updateGPSColumn();//verificar si la patente de la base flota esta en la lista de gps y actualizar la columna gps en la base flota