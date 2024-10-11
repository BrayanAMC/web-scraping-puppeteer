import { getSiteId, getListIdByName, createOrGetSharePointList, addOrUpdateItemsToSharePointList } from './functions/sharepointOperations.js';
import { createChassisToPatentMap, readJsonData } from './functions/dataProcessing.js';

(async () => {
    try {
        const siteId = await getSiteId();
        const GpsListId = await createOrGetSharePointList(siteId, "GPS_PRUEBA", "Lista con datos extraídos mediante scraping");
        const flotaListId = await getListIdByName(siteId, "BASE_FLOTA");
        const chassisToPatentMap = await createChassisToPatentMap(siteId, flotaListId);
        const data = readJsonData(chassisToPatentMap);
        await addOrUpdateItemsToSharePointList(siteId, GpsListId, data);
    } catch (error) {
        console.error("Error en la ejecución:", error);
    }
})();
