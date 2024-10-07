import puppeteer from "puppeteer";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config();

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
        slowMo: 200,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(urlCubiq, { waitUntil: 'networkidle2' });
    await page.type('#okta-signin-username', username);
    await page.type('#okta-signin-password', password);
    await page.click('#okta-signin-submit');
    await new Promise(r => setTimeout(r, 12000));
    //estamos ya en la pagina que tiene las listas de los vehiculos
    let allVehiclesInfo = [];
    let vehicles = await page.$$('.p-element.hoverable-row.p-selectable-row.ng-star-inserted')//refenencia  a la etiqueta a de cada patente, es una "lista"
    
    for (let i = 0; i < vehicles.length; i++) {// cambiar a vehicles.length
        await vehicles[i].click();
        await new Promise(r => setTimeout(r, 2000));
        const newVehicleInfo = await page.evaluate(() => {//entra al HTML
            const vehicleInfoElement = document.querySelector('.ng-tns-c88-7.p-dialog-content');//referencia al div con toda la informacion del vehiculo
            if (!vehicleInfoElement) return null;
            const patentElement = vehicleInfoElement.querySelector('.TEST_tx_SN > span')//patente
            const locationElement = vehicleInfoElement.querySelector('.TEST_tx_LOC > span')//ubicacion
            const odometerElement = vehicleInfoElement.querySelector('.TEST_tx_MILEAGE')//odometro
            const hourometerElement = vehicleInfoElement.querySelector('.TEXT_tx_HOURS')//horometro
            const lastUpdateElement = vehicleInfoElement.querySelector('.TEST_tx_TIME.last-updated-time')//ultima actualizacion

            const patent = patentElement ? patentElement.innerText : null;
            const location = locationElement ? locationElement.innerText : null;
            const odometer = odometerElement ? odometerElement.innerText + ' km' : null;
            const hourometer = hourometerElement ? hourometerElement.innerText + ' h' : null;
            const lastUpdate = lastUpdateElement ? lastUpdateElement.innerText : null;
            return {
                patent,
                location,
                odometer,
                hourometer,
                lastUpdate,
                source: 'Cubiq'
            };
        })
        allVehiclesInfo.push(newVehicleInfo);
        //fin logica para extraer informacion de cada vehiculo
        await page.click('.TEST_afsd_close.material-icons')//click en boton cerrar (X)
    }
    console.log(allVehiclesInfo);
    console.log(allVehiclesInfo.length);
    await browser.close();
    // Guardar en JSON
    const jsonPath = path.join('cubiq.json');
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
