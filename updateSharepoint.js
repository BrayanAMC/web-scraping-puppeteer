import { getSiteId, getListIdByName, createOrGetSharePointList, addOrUpdateItemsToSharePointList, addOItemsToSharePointList } from './functions/sharepointOperations.js';
import { createChassisToPatentMap, readJsonData } from './functions/dataProcessing.js';

(async () => {
    try {
        const siteId = await getSiteId();
        const GpsListId = await createOrGetSharePointList(siteId, "GPS", "Lista con datos extraídos mediante scraping");
        const GPS_HISTORICOListId = await createOrGetSharePointList(siteId, "GPS_HISTORICO", "Lista con datos extraídos mediante scraping");
        const flotaListId = await getListIdByName(siteId, "BASE_FLOTA");
        const chassisToPatentMap = await createChassisToPatentMap(siteId, flotaListId);
        const data = readJsonData(chassisToPatentMap);
        await addOrUpdateItemsToSharePointList(siteId, GpsListId, data);
        await addOItemsToSharePointList(siteId, GPS_HISTORICOListId, data);
    } catch (error) {
        console.error("Error en la ejecución:", error);
    }
})();
