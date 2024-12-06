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

async function updateBaseFlota_FECHA_INICIO_Y_FECHA_TERMINO() {//actualiza la base flota con las fechas de inicio y termino del excel de daniela
   try {
       // Cargar el libro de Excel
       const workbook = new ExcelJS.Workbook();
       await workbook.xlsx.readFile('BASE FLOTA REV - Planta.xlsx');
       const worksheet = workbook.getWorksheet(1); // Asume que está en la primera hoja

       // Obtener datos del Excel
       // Encontrar índices de columnas
       const headers = worksheet.getRow(1);
       const patenteColumnIndex = headers.values.findIndex(header => header === 'PATENTE SIN GUION');
       const fInicioColumnIndex = headers.values.findIndex(header => header === 'F.INICIO');
       const fTerminoColumnIndex = headers.values.findIndex(header => header === 'F.TERMINO');

       // Verificar que se encontraron los índices
       if (patenteColumnIndex === -1 || fInicioColumnIndex === -1 || fTerminoColumnIndex === -1) {
           throw new Error('No se encontraron todas las columnas necesarias');
       }
    
    
       // Obtener datos del Excel
       const excelData = [];
       worksheet.eachRow((row, rowNumber) => {
           // Saltar la fila de encabezados
           if (rowNumber > 1) {
               const patente = row.getCell(patenteColumnIndex).text.trim();
               const fechaInicio = row.getCell(fInicioColumnIndex).value;
               const fechaTermino = row.getCell(fTerminoColumnIndex).value;

               // Convertir fechas de Excel a objetos Date
               const fInicio = fechaInicio instanceof Date ? fechaInicio : null;
               const fTermino = fechaTermino instanceof Date ? fechaTermino : null;
               //const fInicio = typeof fechaInicio === 'number' ? convertExcelDateToJSDate(fechaInicio) : null;
               //const fTermino = typeof fechaTermino === 'number' ? convertExcelDateToJSDate(fechaTermino) : null;
               if (patente) {
                   excelData.push({
                       patente,
                       fInicio,
                       fTermino
                   });
               }
           }
       });
       // Configuración de SharePoint
       const siteId = await getSiteId();
       const baseFlotaListId = await getListIdByName(siteId, "BASE_FLOTA");

       // Obtener columnas de BASE_FLOTA
       const columns = await client.api(`/sites/${siteId}/lists/${baseFlotaListId}/columns`).get();
       const patenteColumnName = columns.value.find(col => col.displayName === 'PATENTE').name;
       const fInicioColumnName = columns.value.find(col => col.displayName === 'F_INICIO').name;
       const fTerminoColumnName = columns.value.find(col => col.displayName === 'F_TERMINO').name;

       // Obtener items de BASE_FLOTA
       let baseFlotaItems = [];
       let hasMoreItems = true;
       let nextLink = null;

       while (hasMoreItems) {
           const response = await client.api(`/sites/${siteId}/lists/${baseFlotaListId}/items`)
               .expand('fields')
               .top(500)
               .skipToken(nextLink)
               .get();
           
           baseFlotaItems = baseFlotaItems.concat(response.value);
           hasMoreItems = response.hasMore;
           nextLink = response.nextLink;
       }

       // Crear un nuevo libro de Excel para resultados
       const resultWorkbook = new ExcelJS.Workbook();
       const resultWorksheet = resultWorkbook.addWorksheet('Resultados Comparación');

       // Añadir encabezados
       resultWorksheet.columns = [
           { header: 'Patente', key: 'patente' },
           { header: 'Patente Encontrada', key: 'patenteEncontrada' },
           { header: 'F.INICIO Excel', key: 'fInicioExcel' },
           { header: 'F.TERMINO Excel', key: 'fTerminoExcel' }
       ];

       // Contador para seguimiento
       let matchedCount = 0;
       let unmatchedCount = 0;

       const formatDate = (date) => {
        const isoString = date.toISOString().split('T')[0]; // Obtener la fecha en formato YYYY-MM-DD
        //const [year, month, day] = isoString.split('-'); // Dividir la fecha en año, mes y día
        //formatea ahora de string a date y lo retorna
        //const dateFormated = new Date(year, month - 1, day);
        console.log('Fecha formateada:', isoString);
        return isoString;
        //return dateFormated;
        //return `${day}/${month}/${year}`; // Formatear la fecha como DD/MM/YYYY
        };
        

       // Comparar y generar Excel de resultados
       for (const excelRow of excelData) {
           const matchedItem = baseFlotaItems.find(item => 
               item.fields[patenteColumnName] === excelRow.patente
           );

           resultWorksheet.addRow({
               patente: excelRow.patente,
               patenteEncontrada: matchedItem ? 'Sí' : 'No',
               
                //fInicioExcel: excelRow.fInicio ? formatDate(excelRow.fInicio) : 'N/A',
                //fTerminoExcel: excelRow.fTermino ? formatDate(excelRow.fTermino) : 'N/A'
               fInicioExcel: excelRow.fInicio ? excelRow.fInicio.toISOString().split('T')[0] : 'N/A',
               fTerminoExcel: excelRow.fTermino ? excelRow.fTermino.toISOString().split('T')[0] : 'N/A'
           });
           //console.log('ExcelRow:', excelRow.fInicio);  

           if (matchedItem) {
               matchedCount++;
           } else {
               unmatchedCount++;
           }
       }
       

       // Guardar el archivo de resultados
       await resultWorkbook.xlsx.writeFile('Comparacion_Patentes.xlsx');

       console.log(`Comparación completada. 
       - Patentes coincidentes: ${matchedCount}
       - Patentes no coincidentes: ${unmatchedCount}`);

       // COMENTADA LA ACTUALIZACIÓN EN SHAREPOINT
       let updatedCount = 0;
        let skippedCount = 0;
 
       // Actualizar fechas en SharePoint
       for (const item of baseFlotaItems) {
           const patente = item.fields[patenteColumnName];
           
           // Buscar la patente en los datos del Excel
           const excelRow = excelData.find(data => 
               data.patente === patente
           );

           if (excelRow) {
               // Preparar campos para actualizar
               const updateFields = {};
               
               // Añadir F_INICIO si existe
               if (excelRow.fInicio) {
                   //updateFields[fInicioColumnName] = formatDate(excelRow.fInicio);
                   updateFields[fInicioColumnName] = excelRow.fInicio.toISOString().split('T')[0];
               }
               
               // Añadir F_TERMINO si existe
               if (excelRow.fTermino) {
                   //updateFields[fTerminoColumnName] = formatDate(excelRow.fTermino);
                     updateFields[fTerminoColumnName] = excelRow.fTermino.toISOString().split('T')[0];
               }

               // Actualizar solo si hay campos para actualizar
               if (Object.keys(updateFields).length > 0) {
                   await client.api(`/sites/${siteId}/lists/${baseFlotaListId}/items/${item.id}`)
                       .update({
                           fields: updateFields
                       });
                   updatedCount++;
               }
           } else {
               skippedCount++;
           }
       }
       

   } catch (error) {
       console.error('Error al procesar fechas:', error);
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
//updateGPSColumn();//verificar si la patente de la base flota esta en la lista de gps y actualizar la columna gps en la base flota
updateBaseFlota_FECHA_INICIO_Y_FECHA_TERMINO();