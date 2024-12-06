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

    const urlOrbisGPS = "https://orvis.gpschile.com/?lang=es";
    const username = process.env.USER;
    const password = process.env.PASSWORD;
    if (!username || !password) {
        console.error("Username or password is not defined in the environment variables.");
        return;
    }

    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);

    const browser = await puppeteer.launch({
        headless: true,
        slowMo: 5,
        timeout: 60000,
        protocolTimeout: 60000,
        //args: ['--no-sandbox', '--disable-setuid-sandbox'],
        //defaultViewport: null,
        //protocolTimeout: 120000
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(urlOrbisGPS, { waitUntil: 'networkidle2' });

    await page.type('#user', username);
    await page.type('#passw', password);
    await page.waitForSelector('#submit');
    await page.click('#submit');
    await new Promise(r => setTimeout(r, 5000));
    
    let items = [];
    const uniquePatents = new Set();
    let previousHeight = 0;
    let currentHeight = 0;
    
    while(true){
        //poder ver si se puede hacer hover
        await page.waitForSelector('.x-monitoring-unit-row');
        let rows = await page.$$('.x-monitoring-unit-row');
        let contador = 0;
        for(const row of rows){
            contador++;
            await row.evaluate(node => node.scrollIntoView());
            await row.hover();
            await new Promise(r => setTimeout(r, 1500));
            await page.waitForFunction(() => document.querySelector('div#messageBoxWrapper.messageBoxWrapper_esoK') && document.querySelector('div#messageBoxWrapper.messageBoxWrapper_esoK').innerText !== '');
            await new Promise(r => setTimeout(r, 1000));
            // Extraer la información del pop-up
            const additionalInfo = await page.evaluate(async () => {
                const popup = document.querySelector('div#messageBoxWrapper.messageBoxWrapper_esoK');
                if (!popup) return null;
                
                const patent = popup.querySelector('div.name_TOAI');
                const location = popup.querySelector('div.addressName_WTb9');
                const odometerElement = popup.querySelector('td.mileage_j0GY div');
                let odometer = 'N/A km';
                if (odometerElement) {
                    const odometerText = odometerElement.innerText.trim();
                    const odometerMatch = odometerText.match(/(\d+)/); // Captura solo los dígitos
                    if (odometerMatch) {
                        odometer = odometerMatch[1]; // Extrae el número capturado
                    }
                }
                const hourometerElement = popup.querySelector('td.engineHoursCounter_7QnA div');
                let hourometer = 'N/A h';
                if (hourometerElement) {
                    const hourometerText = hourometerElement.innerText.trim();
                    const hourometerMatch = hourometerText.match(/(\d+)/); // Captura solo la parte entera
                    if (hourometerMatch) {
                        hourometer = hourometerMatch[1];
                    }
                }
                const lastUpdate = popup.querySelector('div.lastUpdate_oGrS');
                const coordButton = popup.querySelector('button.wui2-button.no-accent');
                let latitude = null;
                let longitude = null;
                if(coordButton){
                    const tempTextArea = document.createElement('textarea');
                    document.body.appendChild(tempTextArea);
                    const coordinates = await new Promise(resolve => {
                        // Sobrescribir temporalmente el método writeText del clipboard
                        window.navigator.clipboard.writeText = text => {
                            resolve(text);
                            return Promise.resolve();
                        };
                        coordButton.click();
                    });
                    document.body.removeChild(tempTextArea);
                    if (coordinates) {
                        const coords = coordinates.split(',').map(coord => parseFloat(coord.trim()));
                        if (coords.length === 2) {
                            [latitude, longitude] = coords;
                        }
                    }
                }else{
                    console.log('No se encontró el botón de coordenadas');
                }
                
                const formatDate = (dateString) => {
                    const [date, time] = dateString.split(' ');
                    const formattedDate = date.replace(/\./g, '/');
                    return `${formattedDate} ${time}`;
                };

                return {
                    patent: patent ? patent.innerText.trim() : null,
                    location: location ? location.innerText.trim() : null,
                    odometer: odometer? odometer : null,
                    hourometer: hourometer ? hourometer : null,
                    lastUpdate: lastUpdate ? formatDate(lastUpdate.innerText.split('\n')[1].trim()) : null,
                    source: 'Orvis GPS',
                    latitude: latitude,
                    longitude: longitude
                };
            });
            if (additionalInfo && !uniquePatents.has(additionalInfo.patent)) {
                uniquePatents.add(additionalInfo.patent);
                items.push(additionalInfo);
            }
        }
        await new Promise(r => setTimeout(r, 5000));
        previousHeight = currentHeight;
        currentHeight = await page.evaluate(() => {
            const scrollableContainer = document.querySelector('[data-test="ftbody"]');
            return scrollableContainer.scrollHeight;
        });
        
        if (currentHeight === previousHeight) {
            break;
        }
        
        await page.evaluate(() => {
            const scrollableContainer = document.querySelector('[data-test="ftbody"]');
            scrollableContainer.scrollTo(0, scrollableContainer.scrollHeight);
        });
        rows = await page.$$('.x-monitoring-unit-row');

    };
    console.log(items);
    console.log(items.length);
    await browser.close();
    // Guardar en JSON
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsonPath = path.join(outputDir, 'orvisgps.json');
    fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2));

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