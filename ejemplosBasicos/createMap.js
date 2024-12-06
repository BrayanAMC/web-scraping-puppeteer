import xlsx from 'xlsx';
import { getSiteId, getListIdByName } from '../functions/sharepointOperations.js';
import { client } from '../functions/authClient.js';

const siteId = await getSiteId();
const listId = await getListIdByName(siteId, "BASE_FLOTA");

const workbook = xlsx.readFile('actualizar2.xlsx');
const sheet = workbook.Sheets['Sheet1'];
const excelData = xlsx.utils.sheet_to_json(sheet);

const excelMap = {};
excelData.forEach(row => {
  const patent = row.PATENTE;
  const codigoCentroCosto = row.CODIGO_CENTRO_COSTO;
  const nombreCentroCosto = row.NOMBRE_CENTRO_COSTO;

  if (!excelMap[patent]) {
    excelMap[patent] = { codigoCentroCosto, nombreCentroCosto };
  }
});
//console.log("Mapa de Excel creado:", excelMap);

async function updateSharePointList(siteId, listId, excelMap) {
    try {
        let items = [];
        let columns = [];
        let hasMoreItems = true;
        let nextLink = null;

        while (hasMoreItems) {
            const response = await client.api(`/sites/${siteId}/lists/${listId}/items`)
                .expand('fields').top(500).skipToken(nextLink).get();
            
            const responseColumns = await client.api(`/sites/${siteId}/lists/${listId}/columns`).get(); 
            //console.log("responseColumns", responseColumns);    
            items = items.concat(response.value);
            columns = columns.concat(responseColumns.value);
            hasMoreItems = response.hasMore;
            nextLink = response.nextLink;
        }
        console.log("Total de elementos obtenidos de la lista de sharepoint:", items.length);
        let contador = 0;
        const columnMap = {};
        columns.forEach(column => {
            columnMap[column.displayName] = column.name;
        });

        const patentField = columnMap['PATENTE'];
        const codigoCentroCostoField = columnMap['CODIGO_CENTRO_COSTO'];
        const nombreCentroCostoField = columnMap['NOMBRE_CENTRO_COSTO'];
        //console.log("columnMap", columnMap);
        //console.log("items", items);

        console.log("Total de elementos en SharePoint obtenidos:", items.length);

        // Recorrer los elementos de SharePoint y actualizarlos si la patente está en el Excel
        for (const item of items) {
            let patent = item.fields[patentField];
            //console.log("patent", patent);
            //console.log("excelMap",excelMap);
            if (excelMap[patent]) { // Si la patente está en el Excel, actualiza el elemento
                const { codigoCentroCosto, nombreCentroCosto } = excelMap[patent];

                // Realizar la actualización en SharePoint
                await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}`)
                    .update({
                        fields: {
                            [codigoCentroCostoField]: codigoCentroCosto,
                            [nombreCentroCostoField]: nombreCentroCosto
                        }
                    });
                console.log(`Patente ${patent} actualizada en SharePoint con centro de costo ${codigoCentroCosto} y nombre ${nombreCentroCosto}.`);
                contador++;
            }else{
                console.log(`Patente ${patent} no encontrada en el Excel.`);
            }
        }
        //console.log("excelMap",excelMap);
        console.log(`se han actualizado ${contador} elementos en SharePoint.`);

        console.log("Actualización completada.");
    } catch (error) {
        console.error("Error actualizando SharePoint:", error);
        throw error;
    }
}
await updateSharePointList(siteId, listId, excelMap);

