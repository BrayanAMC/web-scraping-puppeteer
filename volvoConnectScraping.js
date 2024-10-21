import puppeteer from "puppeteer";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scraping() {
    const startTime = process.hrtime();
    const initialMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

    const urlVolvoConnect = process.env.VOLVO_CONNECT_URL;
    const username = process.env.VOLVO_USER;
    const password = process.env.VOLVO_PASSWORD;

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
    await page.goto(urlVolvoConnect, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#username');
    await page.type('#username', username);
    await page.waitForSelector('#password');
    await page.type('#password', password);
    await page.waitForSelector('[data-testid="login-button"]');
    await page.click('[data-testid="login-button"]');
    await new Promise(r => setTimeout(r, 10000));
    await page.waitForSelector('[data-testid="main-menu-toggle"]');
    //await page.click('[data-testid="main-menu-toggle"]');
    await page.evaluate(() => {
        const element = document.querySelector('[data-testid="main-menu-toggle"]');
        if (element) {
            element.click();
        } else {
            console.log('Element not found');
        }
    });
    await page.waitForSelector('[data-testid="pros-assets-icon"]', { timeout: 60000 });
    await page.evaluate(() => {
        const element = document.querySelector('[data-testid="pros-assets-icon"]');
        if (element) {
            element.click();
        } else {
            console.log('Element not found');
        }
    });
    //await page.click('[data-testid="pros-assets-icon"]');
    await page.waitForSelector('.MuiTypography-root.MuiTypography-body1');
    await page.click('.MuiTypography-root.MuiTypography-body1');
    //estamos en la pagina que tiene ya las listas de los vehiculos
    let allVehiclesInfo = [];
    await page.waitForSelector('.MuiTypography-root.MuiTypography-subtitle1.MuiLink-root')//espera a que carguen las patentes
    let vehicles = await page.$$('.MuiTypography-root.MuiTypography-subtitle1.MuiLink-root')//refenencia  a la etiqueta a de cada patente, es una "lista"
    for (let i = 0; i < vehicles.length; i++) {// cambiar a vehicles.length
        await vehicles[i].click();
        //logica para extraer informacion de cada vehiculo
        await page.waitForSelector('[data-testid="vehicleDetailsTab"]')
        await page.click('[data-testid="vehicleDetailsTab"]')//click en pestaña info vehiculo
        await new Promise(r => setTimeout(r, 2000));//si es menor a 1000 no carga la ubicacion
        //aqui se extrae el div que tiene toda la informacion de interes y se retorna
        const newVehicleInfo = await page.evaluate(() => {//entra al HTML
        const vehicleInfoElement = document.querySelector('[data-testid="VehicleDetails-body"]');//referencia al div con toda la informacion del vehiculo
        if (!vehicleInfoElement) return null;

        const patentElement = vehicleInfoElement.querySelector('[data-testid="generalRegistrationNumber"] > div > p') ||
                              vehicleInfoElement.querySelector('[data-testid="generalVIN"] > div > p');
        const locationElement = vehicleInfoElement.querySelector('[data-testid="lastObservationPosition"] div p span');
        const odometerElement = vehicleInfoElement.querySelector('[data-testid="lastObservationOdometer"] div p span');
        const hourometerElement = vehicleInfoElement.querySelector('[data-testid="lastObservationEngineHours"] div p span span');
        const lastUpdateElement = vehicleInfoElement.querySelector('[data-testid="lastObservationDate"] div p span');

        function formatDate(dateString) {
            console.log(dateString);
            const [datePart, timePart] = dateString.split(' ');
            const [month, day, year] = datePart.split('/');
            const [time, modifier] = timePart.split(' ');
            let [hours, minutes] = time.split(':');
            console.log(modifier);
            console.log(hours);
            if (modifier === "PM" && hours !== "12") {
                console.log('entro al if'); 
                hours = String(parseInt(hours, 10) + 12);
            } else if (modifier === 'AM' && hours === '12') {
                hours = '00';
            }
    
            return `${day}/${month}/${year} ${hours}:${minutes}:00`;
        }

        const patent = patentElement ? patentElement.innerText : null;
        const location = locationElement ? locationElement.innerText : null;
        const odometer = odometerElement ? odometerElement.innerText + ' km' : null;
        const hourometer = hourometerElement ? hourometerElement.innerText + ' h' : null;
        const lastUpdate = lastUpdateElement ? formatDate(lastUpdateElement.innerText) : null;

            return {
                patent,
                location,
                odometer,
                hourometer,
                lastUpdate,
                source: 'Volvo Connect'
            }
        });
        allVehiclesInfo.push(newVehicleInfo);
        //fin logica para extraer informacion de cada vehiculo
        await page.goBack();
        //await new Promise(r => setTimeout(r, 1000));
        await page.waitForSelector('.MuiTypography-root.MuiTypography-subtitle1.MuiLink-root')
        vehicles = await page.$$('.MuiTypography-root.MuiTypography-subtitle1.MuiLink-root')// se vuelve a obtener la lista de patentes
    }
    console.log(allVehiclesInfo);
    console.log(allVehiclesInfo.length);
    await browser.close();

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Guardar en JSON en la carpeta output
    const jsonPath = path.join(outputDir, 'volvoConnect.json');
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