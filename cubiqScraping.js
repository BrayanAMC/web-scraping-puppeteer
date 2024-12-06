import puppeteer from "puppeteer";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatLastUpdate(lastUpdate) {
    if (!lastUpdate || lastUpdate.trim() === "" || lastUpdate === "N/A") {
        return "Sin información";
    }

    const now = new Date();
    let date;
    let time = "00:00:00";
    if (lastUpdate.includes("atrás") || lastUpdate.includes("hace")) {
        const number = parseInt(lastUpdate.match(/\d+/)[0]);
        if (lastUpdate.includes("horas")) {
            date = new Date(now.getTime() - number * 60 * 60 * 1000);
        } else if (lastUpdate.includes("día") || lastUpdate.includes("días")) {
            date = new Date(now.getTime() - number * 24 * 60 * 60 * 1000);
        }
    } else {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const parts = lastUpdate.split(" - ")[1].split(", ");
        const [monthDayYear, hourMinute] = parts;
        const [month, day, year] = monthDayYear.split(" ");
        
        if (hourMinute) {
            time = hourMinute.includes(":") ? hourMinute : hourMinute + ":00"; // Añadimos los segundos si no están incluidos
        }
        
        date = new Date(`${year}-${(months.indexOf(month) + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}T${time}`);
    }

    if (isNaN(date.getTime())) {
        return "Fecha inválida";
    }
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} 00:00:00`;
}

async function scraping() {

    const startTime = process.hrtime();
    const initialMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const urlCubiq = process.env.CUBIQ_URL;
    const username = process.env.CUBIQ_USER;
    const password = process.env.CUBIQ_PASSWORD;

    if (!username || !password) {
        console.error("Username or password is not defined in the environment variables.");
        return;
    }
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: null,
            timeout: 60000,
            protocolTimeout: 60000,
            slowMo: 5
        
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(urlCubiq, { waitUntil: 'networkidle2' });
    await page.type('#okta-signin-username', username);
    await page.type('#okta-signin-password', password);
    await page.waitForSelector('#okta-signin-submit');
    await page.click('#okta-signin-submit');
    await new Promise(r => setTimeout(r, 12000));
    //estamos ya en la pagina que tiene las listas de los vehiculos
    let allVehiclesInfo = [];
    const getCoordinates = (page) => {
        return new Promise((resolve) => {
            const handler = async (response) => {
                const url = response.url();
                const request = response.request();
                if (url.includes('locationservicev2/api/v1/locations') && request.method() === 'GET') {
                    try {
                        const jsonResponse = await response.json();
                        if (jsonResponse.coordinate && jsonResponse.coordinate.latitude && jsonResponse.coordinate.longitude) {
                            resolve({
                                latitude: jsonResponse.coordinate.latitude,
                                longitude: jsonResponse.coordinate.longitude
                            });
                        } else {
                            resolve({
                                latitude: null,
                                longitude: null
                            });
                        }
                        page.off('response', handler);
                    } catch (error) {
                        console.error('Error al obtener la respuesta JSON:', error);
                        resolve({
                            latitude: null,
                            longitude: null
                        });
                        page.off('response', handler);
                    }
                }
            };
            page.on('response', handler);
        });
    };
    await page.waitForSelector('.p-element.hoverable-row.p-selectable-row.ng-star-inserted')//espera a que carguen las patentes
    let vehicles = await page.$$('.p-element.hoverable-row.p-selectable-row.ng-star-inserted')//refenencia  a la etiqueta a de cada patente, es una "lista"
    
    for (let i = 0; i < vehicles.length; i++) {
        try {
            await page.waitForSelector('.p-element.hoverable-row.p-selectable-row.ng-star-inserted');
            const coordinatesPromise = getCoordinates(page);
            await vehicles[i].click();
            await new Promise(r => setTimeout(r, 2000));
            
            const newVehicleInfo = await page.evaluate(() => {
                const vehicleInfoElement = document.querySelector('.ng-tns-c88-7.p-dialog-content');
                if (!vehicleInfoElement) {
                    console.log('No se encontró el elemento vehicleInfoElement');
                    return null;
                }
                const patentElement = vehicleInfoElement.querySelector('.TEST_tx_SN > span');
                const locationElement = vehicleInfoElement.querySelector('.TEST_tx_LOC > span');
                const odometerElement = vehicleInfoElement.querySelector('.TEST_tx_MILEAGE');
                const hourometerElement = vehicleInfoElement.querySelector('.TEXT_tx_HOURS');
                const lastUpdateElement = vehicleInfoElement.querySelector('.TEST_tx_TIME.last-updated-time');

                // Validar odómetro y realizar conversión
                let odometer = 'N/A';
                if (odometerElement && odometerElement.innerText) {
                    const odometerText = odometerElement.innerText.trim();
                    if (odometerText !== 'N/A') {
                        try {
                            const miles = parseFloat(odometerText.replace(/,/g, ''));
                            if (!isNaN(miles)) {
                                const kilometers = miles * 1.60934;
                                odometer = `${Math.floor(kilometers)}`; 
                            }
                        } catch (error) {
                            console.error('Error al convertir odómetro:', error);
                        }
                    }
                }

                return {
                    patent: patentElement && patentElement.innerText ? patentElement.innerText : 'N/A',
                    location: locationElement && locationElement.innerText ? locationElement.innerText : 'N/A',
                    odometer: odometer,
                    hourometer: hourometerElement && hourometerElement.innerText ? hourometerElement.innerText : 'N/A',
                    lastUpdate: lastUpdateElement && lastUpdateElement.innerText ? lastUpdateElement.innerText : 'N/A',
                    source: 'Cubiq'
                };
            });

            // Verificar si se obtuvo información válida
            if (!newVehicleInfo) {
                console.log(`No se pudo obtener información para el vehículo ${i + 1}`);
                continue;
            }

            const coordinates = await coordinatesPromise;
            newVehicleInfo.latitude = coordinates.latitude;
            newVehicleInfo.longitude = coordinates.longitude;
            
            //console.log("newVehicleInfo: ", newVehicleInfo);
            allVehiclesInfo.push(newVehicleInfo);

            await new Promise(r => setTimeout(r, 1000));
            
            // Validar que el botón de cerrar existe antes de hacer click
            const closeButtonExists = await page.evaluate(() => {
                const element = document.querySelector('.TEST_afsd_close.material-icons');
                return !!element;
            });

            if (closeButtonExists) {
                await page.waitForSelector('.TEST_afsd_close.material-icons');
                await page.evaluate(() => {
                    const element = document.querySelector('.TEST_afsd_close.material-icons');
                    if (element) {
                        element.click();
                    }
                });
            } else {
                console.log('Botón de cerrar no encontrado');
            }
            
        } catch (error) {
            console.error(`Error procesando vehículo ${i + 1}:`, error);
            // Intentar cerrar el diálogo si está abierto
            try {
                await page.evaluate(() => {
                    const element = document.querySelector('.TEST_afsd_close.material-icons');
                    if (element) element.click();
                });
            } catch (closeError) {
                console.error('Error al intentar cerrar el diálogo:', closeError);
            }
            continue; // Continuar con el siguiente vehículo
        }
    }
    await browser.close();

    allVehiclesInfo = allVehiclesInfo.map(vehicle => {
        vehicle.lastUpdate = formatLastUpdate(vehicle.lastUpdate);
        return vehicle;
    });
    console.log(allVehiclesInfo);
    console.log(allVehiclesInfo.length);

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const jsonPath = path.join(outputDir, 'cubiq.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allVehiclesInfo, null, 2));

    const endTime = process.hrtime(startTime);
    const executionTimeInSeconds = endTime[0] + endTime[1] / 1e9;
    const finalMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryUsed = finalMemoryUsage - initialMemoryUsage;

    const minutes = Math.floor(executionTimeInSeconds / 60);
    const seconds = (executionTimeInSeconds % 60).toFixed(2);
    console.log(`Archivo JSON creado: ${jsonPath}`);
    console.log(`Tiempo de ejecución: ${minutes} minutos y ${seconds} segundos`);
    console.log(`Memoria utilizada: ${memoryUsed.toFixed(2)} MB`);
}
scraping();    
